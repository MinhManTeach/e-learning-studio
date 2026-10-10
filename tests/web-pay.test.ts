import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { createWebHandler } from "../server/web/app";
import {
  plans,
  signObject,
  signPaymentRequest,
  verifyWebhook,
} from "../server/web/payos";
import { Store } from "../server/web/store";

const checksumKey = "test-checksum-key";

it("signs a payment request like the official PayOS library", () => {
  const r = {
    amount: 49000,
    cancelUrl: "https://a.vn/c",
    description: "GV 123",
    orderCode: 123,
    returnUrl: "https://a.vn/r",
  };
  expect(signPaymentRequest(r, checksumKey)).toBe(
    createHmac("sha256", checksumKey)
      .update(
        "amount=49000&cancelUrl=https://a.vn/c&description=GV 123&orderCode=123&returnUrl=https://a.vn/r",
      )
      .digest("hex"),
  );
});

it("signs webhook data with sorted keys and empty strings for nulls", () => {
  const data = { orderCode: 5, amount: 49000, code: "00", counterAccountName: null };
  expect(signObject(data, checksumKey)).toBe(
    createHmac("sha256", checksumKey)
      .update("amount=49000&code=00&counterAccountName=&orderCode=5")
      .digest("hex"),
  );
});

it("accepts only webhooks signed with our checksum key", () => {
  const data = { orderCode: 5, amount: 49000, code: "00", desc: "success" };
  const signature = signObject(data, checksumKey);
  expect(verifyWebhook({ data, signature }, checksumKey)?.orderCode).toBe(5);
  expect(verifyWebhook({ data: { ...data, amount: 1 }, signature }, checksumKey)).toBeNull();
  expect(verifyWebhook({ data, signature: signObject(data, "other") }, checksumKey)).toBeNull();
  expect(verifyWebhook({ data }, checksumKey)).toBeNull();
  expect(verifyWebhook("junk", checksumKey)).toBeNull();
});

// ---- the server's buying flow, with PayOS and the session stubbed ----
let store: Store;
let server: Server;
let base = "";
let payosCalls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
let handler: ReturnType<typeof createWebHandler> = () => Promise.resolve();
beforeAll(async () => {
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
afterEach(() => store?.close());

function setup(payos = true) {
  store = new Store(":memory:");
  payosCalls = [];
  const transport = (async (url: string, init: RequestInit) => {
    payosCalls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    return new Response(
      JSON.stringify({
        code: "00",
        desc: "success",
        data: { checkoutUrl: "https://pay.payos.vn/web/abc", qrCode: "000201..." },
      }),
    );
  }) as unknown as typeof fetch;
  handler = createWebHandler(
    {
      publicUrl: base,
      google: null,
      ai: {},
      freeCredits: 10,
      sessionDays: 30,
      payos: payos ? { clientId: "cid", apiKey: "key", checksumKey } : null,
    },
    { store, transport },
  );
  const { user } = store.upsertUser({
    provider: "google",
    subject: "g-1",
    email: "a@b.c",
    name: "Cô Lan",
    picture: "",
  });
  const session = `gv_session=${store.createSession(user.id, 86_400_000)}`;
  return { user, session };
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

it("lists the plans only when payments are set up", async () => {
  setup();
  expect((await (await fetch(`${base}/api/plans`)).json()).plans).toEqual(plans);
  setup(false);
  expect((await (await fetch(`${base}/api/plans`)).json()).plans).toEqual([]);
});

it("creates a signed PayOS link for a signed-in teacher's chosen plan", async () => {
  const { user, session } = setup();
  const res = await post("/api/pay/create", { plan: "TEACHER_MONTH" }, { cookie: session });
  expect(res.status).toBe(200);
  const out = await res.json();
  expect(out.checkoutUrl).toBe("https://pay.payos.vn/web/abc");
  const call = payosCalls[0];
  expect(call.url).toBe("https://api-merchant.payos.vn/v2/payment-requests");
  expect(call.headers["x-client-id"]).toBe("cid");
  expect(call.body).toMatchObject({
    orderCode: out.orderCode,
    amount: 49000,
    description: `GV ${out.orderCode}`,
    returnUrl: `${base}/?paid=${out.orderCode}`,
  });
  expect(String(call.body.description).length).toBeLessThanOrEqual(25);
  expect(call.body.signature).toBe(
    signPaymentRequest(call.body as Parameters<typeof signPaymentRequest>[0], checksumKey),
  );
  expect(store.payment(out.orderCode)).toMatchObject({
    userId: user.id,
    status: "PENDING",
    credits: 50,
  });
});

it("refuses to sell without sign-in, from another site, or an unknown plan", async () => {
  const { session } = setup();
  expect((await post("/api/pay/create", { plan: "TEACHER_MONTH" })).status).toBe(401);
  expect(
    (await post("/api/pay/create", { plan: "TEACHER_MONTH" }, { cookie: session, origin: "https://evil.example" })).status,
  ).toBe(403);
  expect((await post("/api/pay/create", { plan: "FREE_FOREVER" }, { cookie: session })).status).toBe(400);
});

it("adds credits when PayOS confirms the transfer, once, and ignores forged webhooks", async () => {
  const { user, session } = setup();
  const { orderCode } = await (
    await post("/api/pay/create", { plan: "TEACHER_MONTH" }, { cookie: session })
  ).json();
  const data = { orderCode, amount: 49000, code: "00", desc: "success", reference: "FT1" };
  const forged = await post("/api/pay/webhook", { data, signature: "0".repeat(64) }, { origin: "https://payos.vn" });
  expect(forged.status).toBe(400);
  expect(store.balance(user.id)).toBe(0);
  const real = { code: "00", desc: "success", success: true, data, signature: signObject(data, checksumKey) };
  // PayOS posts from its own servers: no Origin of ours, yet it is accepted.
  expect((await post("/api/pay/webhook", real, { origin: "https://payos.vn" })).status).toBe(200);
  expect((await post("/api/pay/webhook", real, { origin: "https://payos.vn" })).status).toBe(200);
  expect(store.balance(user.id)).toBe(50);
  expect(store.payment(orderCode)?.status).toBe("PAID");
});

it("does not add credits for a short payment, and answers PayOS's webhook test", async () => {
  const { user, session } = setup();
  const { orderCode } = await (
    await post("/api/pay/create", { plan: "TEACHER_YEAR" }, { cookie: session })
  ).json();
  const short = { orderCode, amount: 49000, code: "00" };
  await post("/api/pay/webhook", { data: short, signature: signObject(short, checksumKey) });
  expect(store.balance(user.id)).toBe(0);
  const test = { orderCode: 123, amount: 3000, code: "00", description: "VQRIO123" };
  const res = await post("/api/pay/webhook", { data: test, signature: signObject(test, checksumKey) });
  expect(res.status).toBe(200);
});
