// The hosted app: serves the built editor, signs teachers in with Google, and
// runs "AI thiết kế bài giảng" on the server's own key, one credit per design.
// Lessons stay in each teacher's browser; the server keeps accounts only.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { LocalAiConfig } from "../openai";
import { designLesson, studioStatus } from "../studio";
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
  verifyWebhook,
  type PayosConfig,
} from "./payos";

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
}

const sessionCookie = "gv_session";
const loginCookie = "gv_login";
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
  const secure = config.publicUrl.startsWith("https://");
  const origin = new URL(config.publicUrl).origin;
  const redirectUri = `${config.publicUrl}/auth/google/callback`;
  const busy = new Set<string>(); // users with an AI design running

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
    const body = (await readJson(req, 10_000).catch(() => ({}))) as {
      plan?: string;
    };
    const plan = plans.find((p) => p.id === body.plan);
    if (!plan) return send(res, 400, { error: "PAY_PLAN" });
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
          returnUrl: `${config.publicUrl}/?paid=${orderCode}`,
          cancelUrl: `${config.publicUrl}/?paid=cancelled`,
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

  async function googleStart(res: ServerResponse) {
    if (!config.google) return send(res, 404, { error: "AUTH_UNAVAILABLE" });
    const login = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(),
    };
    redirect(res, googleAuthUrl(config.google, redirectUri, login), {
      "Set-Cookie": cookie(
        loginCookie,
        `${login.state}.${login.nonce}.${login.verifier}`,
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
    const [state, nonce, verifier] = (
      parseCookies(req.headers.cookie)[loginCookie] ?? ""
    ).split(".");
    const clear = cookie(loginCookie, "", 0);
    const code = url.searchParams.get("code");
    if (!state || url.searchParams.get("state") !== state || !code)
      return redirect(res, "/?login=failed", { "Set-Cookie": clear });
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
      redirect(res, "/", {
        "Set-Cookie": [clear, cookie(sessionCookie, token, days * 86_400)],
      });
    } catch {
      redirect(res, "/?login=failed", { "Set-Cookie": clear });
    }
  }

  async function aiDesign(req: IncomingMessage, res: ServerResponse) {
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
      const plan = await design(
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

  async function serveStatic(res: ServerResponse, path: string) {
    if (!config.staticDir) return send(res, 404, { error: "NOT_FOUND" });
    const root = normalize(config.staticDir + sep);
    const wanted = normalize(join(root, decodeURIComponent(path)));
    let file = wanted.startsWith(root) ? wanted : join(root, "index.html");
    try {
      if (!(await stat(file)).isFile()) file = join(root, "index.html");
    } catch {
      // Unknown paths are the single-page app's own routes.
      file = join(root, "index.html");
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
        return await googleStart(res);
      if (method === "GET" && path === "/auth/google/callback")
        return await googleCallback(req, res, url);
      // PayOS calls this from its own servers, so no origin check; the
      // signature is what proves it.
      if (method === "POST" && path === "/api/pay/webhook")
        return await payWebhook(req, res);
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
        if (method === "GET" && path === "/api/plans")
          return send(res, 200, {
            plans: config.payos ? plans : [],
          });
        if (method === "POST" && path === "/api/pay/create")
          return await buyCredits(req, res);
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
      return await serveStatic(res, path);
    } catch {
      send(res, 500, { error: "SERVER" });
    }
  };
}
