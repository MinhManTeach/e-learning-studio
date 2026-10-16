import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebHandler, type WebConfig } from "../server/web/app";
import { resetGoogleKeyCache } from "../server/web/google";
import { Store } from "../server/web/store";

// ---- a pretend Google: its own signing key, token endpoint and key list ----
function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    privateKey,
    jwk: {
      ...publicKey.export({ format: "jwk" }),
      kid: "k1",
      alg: "RS256",
      use: "sig",
    },
  };
}
const google = keyPair();
const stranger = keyPair();
const b64 = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
function idToken(
  claims: Record<string, unknown>,
  key: KeyObject = google.privateKey,
) {
  const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = b64(claims);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${sig.toString("base64url")}`;
}
let tokenClaims: (nonce: string) => Record<string, unknown>;
let signingKey: KeyObject = google.privateKey;
let lastNonce = "";
let ttsCalls: string[] = [];
let ttsDown = false;
const googleFetch = (async (url: string, init?: RequestInit) => {
  if (url === "https://www.googleapis.com/oauth2/v3/certs")
    return new Response(JSON.stringify({ keys: [google.jwk] }));
  if (url === "https://oauth2.googleapis.com/token") {
    const form = new URLSearchParams(String(init?.body));
    if (form.get("code") !== "good-code")
      return new Response("{}", { status: 400 });
    return new Response(
      JSON.stringify({ id_token: idToken(tokenClaims(lastNonce), signingKey) }),
    );
  }
  if (url === "https://texttospeech.googleapis.com/v1/text:synthesize") {
    ttsCalls.push(JSON.parse(String(init?.body)).input.text);
    if (ttsDown) return new Response("{}", { status: 500 });
    return new Response(
      JSON.stringify({ audioContent: Buffer.from("mp3").toString("base64") }),
    );
  }
  throw new Error("unexpected fetch " + url);
}) as unknown as typeof fetch;

// ---- the app under test ----
const dir = mkdtempSync(join(tmpdir(), "web-"));
mkdirSync(join(dir, "assets"));
writeFileSync(
  join(dir, "index.html"),
  "<!doctype html><title>Giảng Vui</title>",
);
writeFileSync(join(dir, "assets", "app-123.js"), "console.log(1)");
writeFileSync(join(dir, "dieu-khoan.html"), "<title>Điều khoản</title>");
writeFileSync(join(dir, "trang-chu.html"), "<title>Trang chủ lopso</title>");
const apps = mkdtempSync(join(tmpdir(), "apps-"));
mkdirSync(join(apps, "be-vui", "dist", "assets"), { recursive: true });
writeFileSync(
  join(apps, "be-vui", "dist", "index.html"),
  "<title>Bé Vui</title>",
);
writeFileSync(join(apps, "be-vui", "dist", "assets", "a-1.js"), "go()");
let store: Store;
let server: Server;
let base = "";
let designs: Array<() => Promise<unknown>> = [];
const config = (): WebConfig => ({
  publicUrl: base,
  google: { clientId: "client-1", clientSecret: "secret" },
  ai: { provider: "anthropic", apiKey: "sk-ant-test" },
  freeCredits: 2,
  sessionDays: 30,
  staticDir: dir,
  appsDir: apps,
  ttsKey: "tts-key",
  lectureVoice: true,
});
beforeAll(async () => {
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
  rmSync(apps, { recursive: true, force: true });
});
let handler: ReturnType<typeof createWebHandler> = () => Promise.resolve();
function fresh() {
  store = new Store(":memory:");
  resetGoogleKeyCache();
  signingKey = google.privateKey;
  tokenClaims = (nonce) => ({
    iss: "https://accounts.google.com",
    aud: "client-1",
    sub: "g-123",
    email: "co.lan@example.com",
    email_verified: true,
    name: "Cô Lan",
    picture: "https://lh3.googleusercontent.com/a.png",
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce,
  });
  designs = [];
  ttsCalls = [];
  ttsDown = false;
  handler = createWebHandler(config(), {
    store,
    transport: googleFetch,
    design: async (_ai, body, _signal, _t, report) => {
      const step = designs.shift();
      report?.("", {
        model: "claude-haiku-5-5",
        inputTokens: 900,
        outputTokens: 100,
        ms: 5,
      });
      return step ? step() : { echoed: body };
    },
    lecture: async (_ai, body, _signal, _t, report) => {
      report?.("", {
        model: "claude-haiku-5-5",
        inputTokens: 300,
        outputTokens: 80,
        ms: 5,
      });
      const slots = (body as { slots: unknown[] }).slots;
      return { pieces: slots.map((_, i) => `Đoạn ${i}`) };
    },
  });
}
afterEach(() => store?.close());

const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(name + "="))
    ?.split(";")[0] ?? "";
async function signIn() {
  const start = await fetch(`${base}/auth/google`, { redirect: "manual" });
  const to = new URL(start.headers.get("location")!);
  const login = cookieOf(start, "gv_login");
  lastNonce = to.searchParams.get("nonce")!;
  const back = await fetch(
    `${base}/auth/google/callback?code=good-code&state=${to.searchParams.get("state")}`,
    { redirect: "manual", headers: { cookie: login } },
  );
  return { start, to, back, session: cookieOf(back, "gv_session") };
}
const post = (
  path: string,
  cookie: string,
  body: unknown = { slides: [] },
  origin = base,
) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

it("signs a teacher in with Google, with state, nonce and PKCE, and gives free credits once", async () => {
  fresh();
  expect((await fetch(`${base}/api/me`)).status).toBe(401);
  const { to, back, session } = await signIn();
  expect(to.origin + to.pathname).toBe(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  expect(to.searchParams.get("redirect_uri")).toBe(
    `${base}/auth/google/callback`,
  );
  expect(back.status).toBe(302);
  expect(back.headers.get("location")).toBe("/giao-vien");
  expect(session).toMatch(/^gv_session=.{30,}/);
  const me = await (
    await fetch(`${base}/api/me`, { headers: { cookie: session } })
  ).json();
  expect(me).toEqual({
    user: {
      name: "Cô Lan",
      email: "co.lan@example.com",
      picture: "https://lh3.googleusercontent.com/a.png",
    },
    credits: 2,
    owns: [],
  });
  // Signing in again does not give the free credits again.
  const again = await signIn();
  const me2 = await (
    await fetch(`${base}/api/me`, { headers: { cookie: again.session } })
  ).json();
  expect(me2.credits).toBe(2);
});

it("refuses a sign-in with a wrong state, a forged token, another app's token or a replayed nonce", async () => {
  fresh();
  const start = await fetch(`${base}/auth/google`, { redirect: "manual" });
  const login = cookieOf(start, "gv_login");
  const wrongState = await fetch(
    `${base}/auth/google/callback?code=good-code&state=nope`,
    {
      redirect: "manual",
      headers: { cookie: login },
    },
  );
  expect(wrongState.headers.get("location")).toBe("/giao-vien?login=failed");
  signingKey = stranger.privateKey;
  expect((await signIn()).back.headers.get("location")).toBe(
    "/giao-vien?login=failed",
  );
  signingKey = google.privateKey;
  const claims = tokenClaims;
  tokenClaims = (n) => ({ ...claims(n), aud: "someone-else" });
  expect((await signIn()).back.headers.get("location")).toBe(
    "/giao-vien?login=failed",
  );
  tokenClaims = (n) => ({ ...claims(n), nonce: n + "x" });
  expect((await signIn()).back.headers.get("location")).toBe(
    "/giao-vien?login=failed",
  );
  tokenClaims = (n) => ({ ...claims(n), exp: 1000 });
  expect((await signIn()).back.headers.get("location")).toBe(
    "/giao-vien?login=failed",
  );
  expect(store.balance("anyone")).toBe(0);
});

it("sends the user back to the student app they signed in from, and nowhere off the site", async () => {
  fresh();
  const signInFrom = async (next: string) => {
    const start = await fetch(
      `${base}/auth/google?next=${encodeURIComponent(next)}`,
      { redirect: "manual" },
    );
    const to = new URL(start.headers.get("location")!);
    lastNonce = to.searchParams.get("nonce")!;
    const back = await fetch(
      `${base}/auth/google/callback?code=good-code&state=${to.searchParams.get("state")}`,
      { redirect: "manual", headers: { cookie: cookieOf(start, "gv_login") } },
    );
    return back.headers.get("location");
  };
  expect(await signInFrom("/hoc-sinh/english-adventure/")).toBe(
    "/hoc-sinh/english-adventure/",
  );
  expect(await signInFrom("https://evil.example/")).toBe("/giao-vien");
  expect(await signInFrom("//evil.example/")).toBe("/giao-vien");
  expect(await signInFrom("/hoc-sinh/../api/me")).toBe("/giao-vien");
});

it("spends one credit per successful AI design, none on failure, and stops at zero", async () => {
  fresh();
  const { session } = await signIn();
  const ok = await post("/api/lesson-ai/studio/design", session);
  expect(ok.status).toBe(200);
  expect(ok.headers.get("x-credits-left")).toBe("1");
  designs.push(async () => {
    throw new Error("AI_BUSY");
  });
  const failed = await post("/api/lesson-ai/studio/design", session);
  expect(failed.status).toBe(502);
  expect(await failed.json()).toEqual({ error: "AI_BUSY" });
  expect((await post("/api/lesson-ai/studio/design", session)).status).toBe(
    200,
  );
  const none = await post("/api/lesson-ai/studio/design", session);
  expect(none.status).toBe(402);
  expect(await none.json()).toEqual({ error: "AI_NO_CREDITS" });
  // Billed tokens are logged for the owner, failures included.
  expect(store.usageSummary()).toEqual([
    { model: "claude-haiku-5-5", calls: 3, ok: 2, input: 2700, output: 300 },
  ]);
});

it("needs a signed-in teacher from this site for AI, one design at a time", async () => {
  fresh();
  expect((await post("/api/lesson-ai/studio/design", "")).status).toBe(401);
  const { session } = await signIn();
  expect(
    (
      await post(
        "/api/lesson-ai/studio/design",
        session,
        {},
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  let release = () => {};
  designs.push(() => new Promise((r) => (release = () => r({ slow: true }))));
  const first = post("/api/lesson-ai/studio/design", session);
  await new Promise((r) => setTimeout(r, 50));
  expect((await post("/api/lesson-ai/studio/design", session)).status).toBe(
    429,
  );
  release();
  expect((await first).status).toBe(200);
});

it("tells the editor it is hosted, whether the teacher is signed in and how many credits are left", async () => {
  fresh();
  const anon = await (
    await fetch(`${base}/api/lesson-ai/studio/status`)
  ).json();
  expect(anon).toMatchObject({
    hosted: true,
    signedIn: false,
    credits: 0,
    configured: true,
    images: false,
  });
  const { session } = await signIn();
  const status = await (
    await fetch(`${base}/api/lesson-ai/studio/status`, {
      headers: { cookie: session },
    })
  ).json();
  expect(status).toMatchObject({
    signedIn: true,
    credits: 2,
    model: "claude-haiku-5-5",
  });
});

it("signs out", async () => {
  fresh();
  const { session } = await signIn();
  const out = await post("/auth/logout", session, {});
  expect(out.status).toBe(200);
  expect(cookieOf(out, "gv_session")).toBe("gv_session=");
  expect(
    (await fetch(`${base}/api/me`, { headers: { cookie: session } })).status,
  ).toBe(401);
});

it("serves the editor, with the app's own routes falling back to index.html and no way out of the folder", async () => {
  fresh();
  // The front page is its own page; the studio lives at /giao-vien.
  expect(await (await fetch(`${base}/`)).text()).toContain("Trang chủ lopso");
  const index = await fetch(`${base}/giao-vien`);
  expect(await index.text()).toContain("Giảng Vui");
  expect(await (await fetch(`${base}/bai-giang/123`)).text()).toContain(
    "Giảng Vui",
  );
  const asset = await fetch(`${base}/assets/app-123.js`);
  expect(asset.headers.get("cache-control")).toContain("immutable");
  expect(asset.headers.get("content-type")).toContain("javascript");
  // Plain pages are reachable without ".html"; their own address still works.
  expect(await (await fetch(`${base}/dieu-khoan`)).text()).toContain(
    "Điều khoản",
  );
  expect(await (await fetch(`${base}/dieu-khoan.html`)).text()).toContain(
    "Điều khoản",
  );
  const sneaky = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  expect(await sneaky.text()).toContain("Giảng Vui");
});

it("answers 404 for a missing file or a dotfile, not the home page", async () => {
  fresh();
  // A probe for a specific file that isn't there gets a plain 404 instead of
  // a 200 with the editor shell, which looked like the file might exist.
  expect((await fetch(`${base}/data/app.db`)).status).toBe(404);
  expect((await fetch(`${base}/.env`)).status).toBe(404);
  expect((await fetch(`${base}/missing.js`)).status).toBe(404);
  // The app's own routes (no extension) still fall back to index.html.
  expect((await fetch(`${base}/giao-vien`)).status).toBe(200);
});

it("refuses a Google sign-in whose email is not verified", async () => {
  fresh();
  const claims = tokenClaims;
  tokenClaims = (n) => ({ ...claims(n), email_verified: false });
  expect((await signIn()).back.headers.get("location")).toBe(
    "/giao-vien?login=failed",
  );
  // A missing email_verified claim is treated the same way, not accepted.
  tokenClaims = (n) => {
    const c = claims(n);
    delete c.email_verified;
    return c;
  };
  expect((await signIn()).back.headers.get("location")).toBe(
    "/giao-vien?login=failed",
  );
});

it("rate-limits repeated sign-in starts from one address", async () => {
  fresh();
  for (let i = 0; i < 30; i++)
    expect(
      (await fetch(`${base}/auth/google`, { redirect: "manual" })).status,
    ).toBe(302);
  expect(
    (await fetch(`${base}/auth/google`, { redirect: "manual" })).status,
  ).toBe(429);
});

it("serves each student app from its own build under /hoc-sinh/<name>/", async () => {
  fresh();
  const bare = await fetch(`${base}/hoc-sinh/be-vui`, { redirect: "manual" });
  expect(bare.status).toBe(302);
  expect(bare.headers.get("location")).toBe("/hoc-sinh/be-vui/");
  expect(await (await fetch(`${base}/hoc-sinh/be-vui/`)).text()).toContain(
    "Bé Vui",
  );
  const asset = await fetch(`${base}/hoc-sinh/be-vui/assets/a-1.js`);
  expect(await asset.text()).toBe("go()");
  expect(asset.headers.get("cache-control")).toContain("immutable");
  // The app's own screens fall back to its index.html, never outside it.
  expect(await (await fetch(`${base}/hoc-sinh/be-vui/bai/2`)).text()).toContain(
    "Bé Vui",
  );
  expect(
    await (await fetch(`${base}/hoc-sinh/be-vui/..%2f..%2fapp.db`)).text(),
  ).toContain("Bé Vui");
  // An app that is not there yet leaves the address to the site.
  expect(await (await fetch(`${base}/hoc-sinh/chua-co/`)).text()).toContain(
    "Giảng Vui",
  );
});

it("reads short Vietnamese phrases aloud, once per phrase, and says when it cannot", async () => {
  fresh();
  const one = await fetch(
    `${base}/api/tts?text=${encodeURIComponent("Một cộng hai")}`,
  );
  expect(one.status).toBe(200);
  expect(one.headers.get("content-type")).toBe("audio/mpeg");
  expect(await one.text()).toBe("mp3");
  // The same phrase again comes from memory; the Netlify address works too.
  const again = await fetch(
    `${base}/.netlify/functions/tts?text=${encodeURIComponent("một cộng hai")}`,
  );
  expect(again.status).toBe(200);
  expect(ttsCalls).toEqual(["Một cộng hai"]);
  expect((await fetch(`${base}/api/tts?text=`)).status).toBe(400);
  expect((await fetch(`${base}/api/tts?text=${"a".repeat(201)}`)).status).toBe(
    400,
  );
  ttsDown = true;
  const down = await fetch(`${base}/api/tts?text=ba`);
  expect(down.status).toBe(503);
  expect(await down.json()).toEqual({ error: "TTS_UNAVAILABLE" });
});

it("writes a page's lecture for one credit, and speaks it with Google's voice", async () => {
  fresh();
  const { session } = await signIn();
  const page = {
    pageTitle: "Trước cổng trời",
    slots: [
      { step: 0, label: "Khi mở trang", texts: [], pictures: 1 },
      {
        step: 1,
        label: "Lần bấm 1",
        texts: ["Giữa hai bên vách đá"],
        pictures: 0,
      },
    ],
  };
  expect((await post("/api/lesson-ai/studio/lecture", "", page)).status).toBe(
    401,
  );
  const written = await post("/api/lesson-ai/studio/lecture", session, page);
  expect(written.status).toBe(200);
  expect(await written.json()).toEqual({ pieces: ["Đoạn 0", "Đoạn 1"] });
  expect(written.headers.get("x-credits-left")).toBe("1");

  // Each piece is cut into short phrases; their MP3s make one file.
  const long = "Các em quan sát bức tranh. ".repeat(12).trim();
  const spoken = await post("/api/lesson-ai/lecture/voice", session, {
    texts: ["Chào các em.", long],
  });
  expect(spoken.status).toBe(200);
  const { clips, mimeType } = await spoken.json();
  expect(mimeType).toBe("audio/mpeg");
  expect(Buffer.from(clips[0], "base64").toString()).toBe("mp3");
  const phrases = ttsCalls.length - 1;
  expect(phrases).toBeGreaterThan(1);
  expect(ttsCalls.every((t) => t.length <= 200)).toBe(true);
  expect(Buffer.from(clips[1], "base64").toString()).toBe(
    "mp3".repeat(phrases),
  );
  // Nothing to say, or the voice is down: a clear error, no half answer.
  expect(
    (await post("/api/lesson-ai/lecture/voice", session, { texts: [" "] }))
      .status,
  ).toBe(400);
  ttsDown = true;
  const down = await post("/api/lesson-ai/lecture/voice", session, {
    texts: ["Một câu khác hẳn."],
  });
  expect(down.status).toBe(503);
  expect(await down.json()).toEqual({ error: "VOICE_BUSY" });
});

it("tells the editor whether the site has an AI voice", async () => {
  fresh();
  const status = () =>
    fetch(`${base}/api/lesson-ai/lecture/voice`).then((r) => r.json());
  expect(await status()).toEqual({ available: true });
  handler = createWebHandler({ ...config(), ttsKey: undefined }, { store });
  expect(await status()).toEqual({ available: false });
  // A Google key for the student apps alone does not voice lectures.
  handler = createWebHandler({ ...config(), lectureVoice: false }, { store });
  expect(await status()).toEqual({ available: false });
});
