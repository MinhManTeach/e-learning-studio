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
  return { privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" } };
}
const google = keyPair();
const stranger = keyPair();
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
function idToken(claims: Record<string, unknown>, key: KeyObject = google.privateKey) {
  const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
  const body = b64(claims);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${sig.toString("base64url")}`;
}
let tokenClaims: (nonce: string) => Record<string, unknown>;
let signingKey: KeyObject = google.privateKey;
let lastNonce = "";
const googleFetch = (async (url: string, init?: RequestInit) => {
  if (url === "https://www.googleapis.com/oauth2/v3/certs")
    return new Response(JSON.stringify({ keys: [google.jwk] }));
  if (url === "https://oauth2.googleapis.com/token") {
    const form = new URLSearchParams(String(init?.body));
    if (form.get("code") !== "good-code") return new Response("{}", { status: 400 });
    return new Response(JSON.stringify({ id_token: idToken(tokenClaims(lastNonce), signingKey) }));
  }
  throw new Error("unexpected fetch " + url);
}) as unknown as typeof fetch;

// ---- the app under test ----
const dir = mkdtempSync(join(tmpdir(), "web-"));
mkdirSync(join(dir, "assets"));
writeFileSync(join(dir, "index.html"), "<!doctype html><title>Giảng Vui</title>");
writeFileSync(join(dir, "assets", "app-123.js"), "console.log(1)");
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
  handler = createWebHandler(config(), {
    store,
    transport: googleFetch,
    design: async (_ai, body, _signal, _t, report) => {
      const step = designs.shift();
      report?.("", { model: "claude-haiku-5-5", inputTokens: 900, outputTokens: 100, ms: 5 });
      return step ? step() : { echoed: body };
    },
  });
}
afterEach(() => store?.close());

const cookieOf = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(name + "="))?.split(";")[0] ?? "";
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
const post = (path: string, cookie: string, body: unknown = { slides: [] }, origin = base) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

it("signs a teacher in with Google, with state, nonce and PKCE, and gives free credits once", async () => {
  fresh();
  expect((await fetch(`${base}/api/me`)).status).toBe(401);
  const { to, back, session } = await signIn();
  expect(to.origin + to.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  expect(to.searchParams.get("redirect_uri")).toBe(`${base}/auth/google/callback`);
  expect(back.status).toBe(302);
  expect(back.headers.get("location")).toBe("/");
  expect(session).toMatch(/^gv_session=.{30,}/);
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie: session } })).json();
  expect(me).toEqual({
    user: { name: "Cô Lan", email: "co.lan@example.com", picture: "https://lh3.googleusercontent.com/a.png" },
    credits: 2,
  });
  // Signing in again does not give the free credits again.
  const again = await signIn();
  const me2 = await (await fetch(`${base}/api/me`, { headers: { cookie: again.session } })).json();
  expect(me2.credits).toBe(2);
});

it("refuses a sign-in with a wrong state, a forged token, another app's token or a replayed nonce", async () => {
  fresh();
  const start = await fetch(`${base}/auth/google`, { redirect: "manual" });
  const login = cookieOf(start, "gv_login");
  const wrongState = await fetch(`${base}/auth/google/callback?code=good-code&state=nope`, {
    redirect: "manual",
    headers: { cookie: login },
  });
  expect(wrongState.headers.get("location")).toBe("/?login=failed");
  signingKey = stranger.privateKey;
  expect((await signIn()).back.headers.get("location")).toBe("/?login=failed");
  signingKey = google.privateKey;
  const claims = tokenClaims;
  tokenClaims = (n) => ({ ...claims(n), aud: "someone-else" });
  expect((await signIn()).back.headers.get("location")).toBe("/?login=failed");
  tokenClaims = (n) => ({ ...claims(n), nonce: n + "x" });
  expect((await signIn()).back.headers.get("location")).toBe("/?login=failed");
  tokenClaims = (n) => ({ ...claims(n), exp: 1000 });
  expect((await signIn()).back.headers.get("location")).toBe("/?login=failed");
  expect(store.balance("anyone")).toBe(0);
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
  expect((await post("/api/lesson-ai/studio/design", session)).status).toBe(200);
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
  expect((await post("/api/lesson-ai/studio/design", session, {}, "https://evil.example")).status).toBe(403);
  let release = () => {};
  designs.push(() => new Promise((r) => (release = () => r({ slow: true }))));
  const first = post("/api/lesson-ai/studio/design", session);
  await new Promise((r) => setTimeout(r, 50));
  expect((await post("/api/lesson-ai/studio/design", session)).status).toBe(429);
  release();
  expect((await first).status).toBe(200);
});

it("tells the editor it is hosted, whether the teacher is signed in and how many credits are left", async () => {
  fresh();
  const anon = await (await fetch(`${base}/api/lesson-ai/studio/status`)).json();
  expect(anon).toMatchObject({ hosted: true, signedIn: false, credits: 0, configured: true, images: false });
  const { session } = await signIn();
  const status = await (await fetch(`${base}/api/lesson-ai/studio/status`, { headers: { cookie: session } })).json();
  expect(status).toMatchObject({ signedIn: true, credits: 2, model: "claude-haiku-5-5" });
});

it("signs out", async () => {
  fresh();
  const { session } = await signIn();
  const out = await post("/auth/logout", session, {});
  expect(out.status).toBe(200);
  expect(cookieOf(out, "gv_session")).toBe("gv_session=");
  expect((await fetch(`${base}/api/me`, { headers: { cookie: session } })).status).toBe(401);
});

it("serves the editor, with the app's own routes falling back to index.html and no way out of the folder", async () => {
  fresh();
  const index = await fetch(`${base}/`);
  expect(await index.text()).toContain("Giảng Vui");
  expect((await (await fetch(`${base}/bai-giang/123`)).text())).toContain("Giảng Vui");
  const asset = await fetch(`${base}/assets/app-123.js`);
  expect(asset.headers.get("cache-control")).toContain("immutable");
  expect(asset.headers.get("content-type")).toContain("javascript");
  const sneaky = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
  expect(await sneaky.text()).toContain("Giảng Vui");
});
