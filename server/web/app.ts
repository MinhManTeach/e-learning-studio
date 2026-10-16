// The hosted app: serves the built editor, signs teachers in with Google, and
// runs "AI thiết kế bài giảng" on the server's own key, one credit per design.
// Lessons stay in each teacher's browser; the server keeps accounts only.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { LocalAiConfig } from "../openai";
import { designLesson, studioStatus, writeLecture } from "../studio";
import { speechChunks } from "../../src/player/speech";
import {
  googleAuthUrl,
  googleSignIn,
  randomToken,
  type GoogleConfig,
} from "./google";
import type { Store, User } from "./store";
import {
  createPaymentLink,
  plans,
  products,
  verifyWebhook,
  type PayosConfig,
} from "./payos";
import { createTts, TTS_MAX_CHARS } from "./tts";

export interface WebConfig {
  /** Public address, e.g. https://giangvui.vn (no trailing slash). */
  publicUrl: string;
  google: GoogleConfig | null;
  ai: LocalAiConfig;
  /** AI designs given on first sign-in. */
  freeCredits: number;
  sessionDays: number;
  /** Folder with the built editor (vite build output). */
  staticDir?: string;
  /** PayOS keys; without them buying credits is switched off. */
  payos?: PayosConfig | null;
  /** Folder of student apps, each built into <name>/dist and served at
   * /hoc-sinh/<name>/. */
  appsDir?: string;
  /** Google Cloud Text-to-Speech key for the apps' read-aloud. */
  ttsKey?: string;
  /** Google's voice for lectures too (LECTURE_AI_VOICE=1); off, the browser reads them. */
  lectureVoice?: boolean;
}
export interface WebDeps {
  store: Store;
  transport?: typeof fetch;
  now?: () => number;
  /** The AI call; tests pass a stand-in. */
  design?: (
    ai: LocalAiConfig,
    body: unknown,
    signal?: AbortSignal,
    transport?: typeof fetch,
    report?: Parameters<typeof designLesson>[4],
  ) => Promise<unknown>;
  /** "AI viết lời giảng"; tests pass a stand-in. */
  lecture?: (
    ai: LocalAiConfig,
    body: unknown,
    signal?: AbortSignal,
    transport?: typeof fetch,
    report?: Parameters<typeof writeLecture>[4],
  ) => Promise<unknown>;
}

const sessionCookie = "gv_session";
const loginCookie = "gv_login";
/** Where the lesson studio (the single-page app) lives on the site. */
const STUDIO = "/giao-vien";
/** Where sign-in may send the user back to: the studio or a student app.
 * Only these plain paths, so the address can never lead off the site. */
const returnPath = (next: string | null) =>
  next && /^\/(giao-vien|hoc-sinh\/[a-z0-9-]+\/?)$/.test(next) ? next : STUDIO;
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

export function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function createWebHandler(config: WebConfig, deps: WebDeps) {
  const { store } = deps;
  const transport = deps.transport ?? fetch;
  const now = deps.now ?? Date.now;
  const design = deps.design ?? designLesson;
  const lecture = deps.lecture ?? writeLecture;
  const secure = config.publicUrl.startsWith("https://");
  const origin = new URL(config.publicUrl).origin;
  const redirectUri = `${config.publicUrl}/auth/google/callback`;
  const busy = new Set<string>(); // users with an AI design running

  // Light in-memory rate limiting (per process). Enough to blunt bursts such
  // as someone hammering sign-in or spamming payment-link creation on a small
  // VPS; it is not a defence against a large distributed flood.
  const hits = new Map<string, { count: number; resetAt: number }>();
  const rateWindow = 10 * 60_000;
  const authLimit = 30; // sign-in starts per IP per window
  const payLimit = 15; // payment links per teacher per window
  const saveLimit = 600; // progress saves per account per window
  function tooMany(key: string, limit: number): boolean {
    const t = now();
    if (hits.size > 10_000)
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    const e = hits.get(key);
    if (!e || e.resetAt <= t) {
      hits.set(key, { count: 1, resetAt: t + rateWindow });
      return false;
    }
    if (e.count >= limit) return true;
    e.count++;
    return false;
  }
  // The real caller's address, read from Caddy's X-Forwarded-For when present.
  const clientIp = (req: IncomingMessage) => {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : (xff ?? "")).split(",")[0];
    return first.trim() || req.socket.remoteAddress || "?";
  };

  const speak = createTts(config.ttsKey, transport, now);
  // Lectures are long and cost money; Google speaks them only when asked to.
  const lectureVoiceOn = !!(config.ttsKey && config.lectureVoice);

  async function tts(res: ServerResponse, url: URL) {
    const text = (url.searchParams.get("text") ?? "").trim();
    if (!text || text.length > TTS_MAX_CHARS)
      return send(res, 400, { error: "TTS_TEXT" });
    const audio = await speak(text);
    // The app then reads the phrase with the browser's own voice.
    if (!audio) return send(res, 503, { error: "TTS_UNAVAILABLE" });
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    });
    res.end(audio);
  }

  /** A 12-digit order number: time-based, with a random tail. */
  const newOrderCode = () =>
    Number(
      String(now()).slice(-9) +
        String(Math.floor(Math.random() * 1000)).padStart(3, "0"),
    );

  async function buyCredits(req: IncomingMessage, res: ServerResponse) {
    const user = userOf(req);
    if (!user) return send(res, 401, { error: "AUTH_REQUIRED" });
    if (!config.payos) return send(res, 503, { error: "PAY_UNAVAILABLE" });
    if (tooMany(`pay:${user.id}`, payLimit))
      return send(res, 429, { error: "RATE_LIMIT" }, { "Retry-After": "600" });
    const body = (await readJson(req, 10_000).catch(() => ({}))) as {
      plan?: string;
    };
    const product = products.find((p) => p.id === body.plan);
    const plan =
      plans.find((p) => p.id === body.plan) ??
      (product && { ...product, credits: 0 });
    if (!plan) return send(res, 400, { error: "PAY_PLAN" });
    // Content is bought once; a second purchase would only take money.
    if (product && store.paidPlans(user.id).includes(product.id))
      return send(res, 409, { error: "PAY_OWNED" });
    const back = product ? `/hoc-sinh/${product.app}/` : STUDIO;
    let orderCode = newOrderCode();
    for (let i = 0; store.payment(orderCode) && i < 5; i++)
      orderCode = newOrderCode();
    store.createPayment({
      orderCode,
      userId: user.id,
      plan: plan.id,
      amount: plan.amount,
      credits: plan.credits,
    });
    try {
      const link = await createPaymentLink(
        config.payos,
        {
          orderCode,
          amount: plan.amount,
          // Shown on the bank transfer; PayOS allows 25 characters.
          description: `GV ${orderCode}`.slice(0, 25),
          returnUrl: `${config.publicUrl}${back}?paid=${orderCode}`,
          cancelUrl: `${config.publicUrl}${back}?paid=cancelled`,
        },
        transport,
      );
      send(res, 200, { orderCode, ...link });
    } catch (error) {
      send(res, 502, {
        error: error instanceof Error ? error.message : "PAY_PROVIDER",
      });
    }
  }

  // ---- children on a family account, and their progress in student apps ----
  const MAX_KIDS = 6;
  const MAX_PROGRESS_BYTES = 1_000_000;
  async function kidsRoute(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
  ) {
    const user = userOf(req);
    if (!user) return send(res, 401, { error: "AUTH_REQUIRED" });
    if (method === "GET") return send(res, 200, { kids: store.kids(user.id) });
    const body = (await readJson(req, 10_000).catch(() => ({}))) as {
      name?: unknown;
    };
    const name =
      typeof body.name === "string"
        ? body.name.replace(/\s+/g, " ").trim().slice(0, 30)
        : "";
    if (!name) return send(res, 400, { error: "KID_NAME" });
    const kid = store.addKid(user.id, name, MAX_KIDS);
    if (!kid) return send(res, 409, { error: "KID_LIMIT", max: MAX_KIDS });
    send(res, 200, { kid });
  }
  async function progressRoute(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    kidId: string,
    app: string,
  ) {
    const user = userOf(req);
    if (!user) return send(res, 401, { error: "AUTH_REQUIRED" });
    // Another account's child looks the same as no child at all.
    if (!store.kid(user.id, kidId))
      return send(res, 404, { error: "NOT_FOUND" });
    if (method === "GET") return send(res, 200, store.progress(kidId, app));
    if (tooMany(`save:${user.id}`, saveLimit))
      return send(res, 429, { error: "RATE_LIMIT" }, { "Retry-After": "600" });
    const body = (await readJson(req, MAX_PROGRESS_BYTES).catch(
      () => null,
    )) as { rev?: unknown; data?: unknown } | null;
    if (
      !body ||
      !Number.isInteger(body.rev) ||
      (body.rev as number) < 0 ||
      !body.data ||
      typeof body.data !== "object" ||
      Array.isArray(body.data)
    )
      return send(res, 400, { error: "PROGRESS_INPUT" });
    const saved = store.saveProgress(kidId, app, body.rev as number, body.data);
    if (!saved.ok)
      return send(res, 409, { error: "PROGRESS_STALE", ...saved.current });
    send(res, 200, { rev: saved.rev });
  }

  async function payWebhook(req: IncomingMessage, res: ServerResponse) {
    if (!config.payos) return send(res, 404, { error: "NOT_FOUND" });
    const body = await readJson(req, 100_000).catch(() => null);
    const data = verifyWebhook(body, config.payos.checksumKey);
    if (!data) return send(res, 400, { error: "PAY_SIGNATURE" });
    // "00" is a completed transfer; the amount must match the order exactly.
    if (data.code === "00") store.completePayment(data.orderCode, data.amount);
    // PayOS's own "confirm webhook" test uses an order we never made: still 200.
    send(res, 200, { success: true });
  }

  const cookie = (name: string, value: string, maxAge: number) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const send = (
    res: ServerResponse,
    status: number,
    value: unknown,
    headers: Record<string, string | string[]> = {},
  ) => {
    if (res.destroyed) return;
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(value));
  };
  const redirect = (
    res: ServerResponse,
    to: string,
    headers: Record<string, string | string[]> = {},
  ) => {
    res.writeHead(302, {
      Location: to,
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end();
  };
  const userOf = (req: IncomingMessage): User | null =>
    store.sessionUser(parseCookies(req.headers.cookie)[sessionCookie]);
  // Browsers send Origin on every cross-site POST; ours must match.
  const sameOrigin = (req: IncomingMessage) =>
    req.headers.origin === origin &&
    req.headers["sec-fetch-site"] !== "cross-site";

  async function readJson(req: IncomingMessage, limit: number) {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new Error("AI_INPUT_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new Error("AI_INPUT");
    }
  }

  async function googleStart(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ) {
    if (!config.google) return send(res, 404, { error: "AUTH_UNAVAILABLE" });
    if (tooMany(`auth:${clientIp(req)}`, authLimit))
      return send(res, 429, { error: "RATE_LIMIT" }, { "Retry-After": "600" });
    const login = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(),
    };
    redirect(res, googleAuthUrl(config.google, redirectUri, login), {
      "Set-Cookie": cookie(
        loginCookie,
        `${login.state}.${login.nonce}.${login.verifier}.${returnPath(url.searchParams.get("next"))}`,
        600,
      ),
    });
  }

  async function googleCallback(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ) {
    if (!config.google) return send(res, 404, { error: "AUTH_UNAVAILABLE" });
    const [state, nonce, verifier, next] = (
      parseCookies(req.headers.cookie)[loginCookie] ?? ""
    ).split(".");
    const back = returnPath(next ?? null);
    const clear = cookie(loginCookie, "", 0);
    const code = url.searchParams.get("code");
    if (!state || url.searchParams.get("state") !== state || !code)
      return redirect(res, `${back}?login=failed`, { "Set-Cookie": clear });
    try {
      const profile = await googleSignIn(
        config.google,
        redirectUri,
        code,
        { nonce, verifier },
        transport,
        now(),
      );
      const { user, created } = store.upsertUser({
        provider: "google",
        ...profile,
      });
      if (created && config.freeCredits > 0)
        store.addCredits(user.id, config.freeCredits, "welcome", user.id);
      const days = config.sessionDays;
      const token = store.createSession(user.id, days * 86_400_000);
      redirect(res, back, {
        "Set-Cookie": [clear, cookie(sessionCookie, token, days * 86_400)],
      });
    } catch {
      redirect(res, `${back}?login=failed`, { "Set-Cookie": clear });
    }
  }

  /**
   * The lecture spoken by Google's Vietnamese voice: each piece cut into short
   * phrases (the voice's limit), their MP3s joined into one file per piece.
   */
  async function lectureVoice(req: IncomingMessage, res: ServerResponse) {
    const user = userOf(req);
    if (!user) return send(res, 401, { error: "AUTH_REQUIRED" });
    if (!lectureVoiceOn) return send(res, 503, { error: "VOICE_UNAVAILABLE" });
    const body = (await readJson(req, 200_000).catch(() => null)) as {
      texts?: unknown;
    } | null;
    const texts = body?.texts;
    if (
      !Array.isArray(texts) ||
      !texts.length ||
      texts.length > 31 ||
      texts.some((t) => typeof t !== "string" || !t.trim() || t.length > 4000)
    )
      return send(res, 400, { error: "VOICE_INPUT" });
    const clips: string[] = [];
    for (const text of texts as string[]) {
      const parts: Buffer[] = [];
      for (const phrase of speechChunks(text, TTS_MAX_CHARS)) {
        const audio = await speak(phrase);
        if (!audio) return send(res, 503, { error: "VOICE_BUSY" });
        parts.push(audio);
      }
      clips.push(Buffer.concat(parts).toString("base64"));
    }
    return send(res, 200, { clips, mimeType: "audio/mpeg" });
  }

  /** One paid AI call: the teacher's credit is spent only when it succeeds. */
  async function aiDesign(
    req: IncomingMessage,
    res: ServerResponse,
    run: typeof design = design,
  ) {
    const user = userOf(req);
    if (!user) return send(res, 401, { error: "AUTH_REQUIRED" });
    if (store.balance(user.id) < 1)
      return send(res, 402, { error: "AI_NO_CREDITS" });
    if (busy.has(user.id)) return send(res, 429, { error: "AI_ONE_AT_A_TIME" });
    busy.add(user.id);
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", cancel);
    let usage = { model: "", inputTokens: 0, outputTokens: 0, ms: 0 };
    try {
      const body = await readJson(req, 40_000_000);
      const plan = await run(
        config.ai,
        body,
        controller.signal,
        transport,
        (_line, u) => {
          usage = u;
        },
      );
      const ref = store.recordAiCall({
        userId: user.id,
        ...usage,
        ok: true,
        error: "",
      });
      store.spendCredit(user.id, ref);
      send(res, 200, plan, {
        "X-Credits-Left": String(store.balance(user.id)),
      });
    } catch (error) {
      const code =
        error instanceof Error && /^AI_[A-Z_]+$/.test(error.message)
          ? error.message
          : "AI_UNAVAILABLE";
      // Tokens the provider billed are logged; the teacher's credit is not spent.
      if (usage.model)
        store.recordAiCall({
          userId: user.id,
          ...usage,
          ok: false,
          error: code,
        });
      send(
        res,
        code === "AI_INPUT" ? 400 : code === "AI_INPUT_TOO_LARGE" ? 413 : 502,
        {
          error: code,
        },
      );
    } finally {
      busy.delete(user.id);
      res.off("close", cancel);
    }
  }

  async function serveStatic(
    res: ServerResponse,
    path: string,
    dir = config.staticDir,
  ) {
    if (!dir) return send(res, 404, { error: "NOT_FOUND" });
    const root = normalize(dir + sep);
    const indexFile = join(root, "index.html");
    const wanted = normalize(join(root, decodeURIComponent(path)));
    const isFile = (f: string) =>
      stat(f).then(
        (s) => s.isFile(),
        () => false,
      );
    let file: string;
    if (!wanted.startsWith(root)) {
      // A path that climbs out of the folder: serve the app shell, never a
      // file from elsewhere on disk.
      file = indexFile;
    } else {
      file = wanted;
      // The site's front page is its own plain page; the lesson studio lives
      // at /giao-vien (any unknown path below falls back to it).
      if (
        dir === config.staticDir &&
        path === "/" &&
        (await isFile(join(root, "trang-chu.html")))
      )
        file = join(root, "trang-chu.html");
      // Plain pages such as /dieu-khoan are served from dieu-khoan.html.
      if (
        !extname(file) &&
        !(await isFile(file)) &&
        (await isFile(file + ".html"))
      )
        file += ".html";
      if (!(await isFile(file))) {
        // Not a real file. Paths that look like the app's own routes (no
        // extension, nothing hidden) fall back to index.html; a request for a
        // named file that is not there, or a hidden/dotfile such as /.env, is a
        // plain 404 instead of quietly handing back the home page.
        const rel = wanted.slice(root.length);
        const looksLikeFile =
          extname(rel) !== "" || rel.split(sep).some((s) => s.startsWith("."));
        if (looksLikeFile) return send(res, 404, { error: "NOT_FOUND" });
        file = indexFile;
      }
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": file.includes(`${sep}assets${sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    } catch {
      send(res, 404, { error: "NOT_FOUND" });
    }
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", config.publicUrl);
    const path = url.pathname;
    const method = req.method ?? "GET";
    try {
      if (method === "GET" && path === "/auth/google")
        return await googleStart(req, res, url);
      if (method === "GET" && path === "/auth/google/callback")
        return await googleCallback(req, res, url);
      // PayOS calls this from its own servers, so no origin check; the
      // signature is what proves it.
      if (method === "POST" && path === "/api/pay/webhook")
        return await payWebhook(req, res);
      // Bé Vui Học Cộng also tries the address it had on Netlify.
      if (method === "GET" && path === "/.netlify/functions/tts")
        return await tts(res, url);
      if (path.startsWith("/api/") || path === "/auth/logout") {
        if (method === "POST" && !sameOrigin(req))
          return send(res, 403, { error: "AUTH_ORIGIN" });
        if (method === "POST" && path === "/auth/logout") {
          store.deleteSession(parseCookies(req.headers.cookie)[sessionCookie]);
          return send(
            res,
            200,
            { ok: true },
            { "Set-Cookie": cookie(sessionCookie, "", 0) },
          );
        }
        if (method === "GET" && path === "/api/me") {
          const user = userOf(req);
          if (!user)
            return send(res, 401, {
              error: "AUTH_REQUIRED",
              providers: config.google ? ["google"] : [],
            });
          return send(res, 200, {
            user: { name: user.name, email: user.email, picture: user.picture },
            credits: store.balance(user.id),
            // Student-app content this account has bought, e.g. ENGLISH_A1.
            owns: store
              .paidPlans(user.id)
              .filter((id) => products.some((p) => p.id === id)),
          });
        }
        if (method === "GET" && path === "/api/lesson-ai/studio/status") {
          const user = userOf(req);
          // Pictures are not offered on the hosted app.
          return send(res, 200, {
            ...studioStatus(config.ai),
            images: false,
            imageModel: "",
            hosted: true,
            signedIn: !!user,
            credits: user ? store.balance(user.id) : 0,
          });
        }
        if (method === "POST" && path === "/api/lesson-ai/studio/design") {
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(res, 415, { error: "AI_INPUT" });
          return await aiDesign(req, res);
        }
        if (method === "POST" && path === "/api/lesson-ai/studio/lecture") {
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(res, 415, { error: "AI_INPUT" });
          return await aiDesign(req, res, lecture);
        }
        if (method === "POST" && path === "/api/lesson-ai/lecture/voice")
          return await lectureVoice(req, res);
        // Without a voice key the editor hides "Tạo giọng AI"; the student's
        // page then reads the lecture with the browser's own voice.
        if (method === "GET" && path === "/api/lesson-ai/lecture/voice")
          return send(res, 200, { available: lectureVoiceOn });
        if (method === "GET" && path === "/api/plans")
          return send(res, 200, {
            plans: config.payos ? plans : [],
          });
        if (method === "POST" && path === "/api/pay/create")
          return await buyCredits(req, res);
        if (method === "GET" && path === "/api/tts") return await tts(res, url);
        if ((method === "GET" || method === "POST") && path === "/api/kids")
          return await kidsRoute(req, res, method);
        const progress =
          /^\/api\/kids\/([0-9a-f-]{36})\/progress\/([a-z0-9-]{1,40})$/.exec(
            path,
          );
        if (progress && (method === "GET" || method === "POST"))
          return await progressRoute(
            req,
            res,
            method,
            progress[1],
            progress[2],
          );
        if (method === "GET" && path === "/api/lesson-ai/voice/status")
          return send(res, 200, {
            available: false,
            voice: "",
            reason: "HOSTED",
          });
        return send(res, 404, { error: "NOT_FOUND" });
      }
      if (method !== "GET" && method !== "HEAD")
        return send(res, 405, { error: "METHOD" });
      // A student app, e.g. /hoc-sinh/be-vui-hoc-cong/, from its own build.
      const app = /^\/hoc-sinh\/([a-z0-9-]+)(\/.*)?$/.exec(path);
      if (app && config.appsDir) {
        const dir = join(config.appsDir, app[1], "dist");
        if (await stat(join(dir, "index.html")).catch(() => null)) {
          if (!app[2]) return redirect(res, `${path}/${url.search}`);
          return await serveStatic(res, app[2], dir);
        }
      }
      return await serveStatic(res, path);
    } catch {
      send(res, 500, { error: "SERVER" });
    }
  };
}
