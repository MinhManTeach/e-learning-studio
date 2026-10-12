import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/web/store";

let stores: Store[] = [];
afterEach(() => {
  stores.forEach((s) => s.close());
  stores = [];
});
function store(now = () => 1_000) {
  const s = new Store(":memory:", now);
  stores.push(s);
  return s;
}
const google = (subject = "g-1") => ({
  provider: "google" as const,
  subject,
  email: "co.lan@example.com",
  name: "Cô Lan",
  picture: "",
});

it("creates a user once per Google account and refreshes the profile", () => {
  const s = store();
  const first = s.upsertUser(google());
  expect(first.created).toBe(true);
  const again = s.upsertUser({ ...google(), name: "Cô Lan (Tin học)" });
  expect(again.created).toBe(false);
  expect(again.user.id).toBe(first.user.id);
  expect(s.user(first.user.id)?.name).toBe("Cô Lan (Tin học)");
});

it("keeps only a hash of the session token and honours expiry", () => {
  let now = 1_000;
  const s = store(() => now);
  const { user } = s.upsertUser(google());
  const token = s.createSession(user.id, 60_000);
  expect(token.length).toBeGreaterThan(30);
  expect(s.sessionUser(token)?.id).toBe(user.id);
  expect(s.sessionUser("forged")).toBeNull();
  expect(s.sessionUser(undefined)).toBeNull();
  now += 60_001;
  expect(s.sessionUser(token)).toBeNull();
  now = 1_000;
  s.deleteSession(token);
  expect(s.sessionUser(token)).toBeNull();
});

it("counts credits as a ledger and never records the same grant twice", () => {
  const s = store();
  const { user } = s.upsertUser(google());
  expect(s.addCredits(user.id, 10, "welcome", user.id)).toBe(true);
  expect(s.addCredits(user.id, 10, "welcome", user.id)).toBe(false);
  expect(s.balance(user.id)).toBe(10);
});

it("spends a credit only when there is one", () => {
  const s = store();
  const { user } = s.upsertUser(google());
  s.addCredits(user.id, 1, "welcome", user.id);
  expect(s.spendCredit(user.id, "call-1")).toBe(true);
  expect(s.spendCredit(user.id, "call-2")).toBe(false);
  expect(s.balance(user.id)).toBe(0);
});

it("adds a payment's credits exactly once, and only for the agreed amount", () => {
  const s = store();
  const { user } = s.upsertUser(google());
  s.createPayment({
    orderCode: 12345,
    userId: user.id,
    plan: "TEACHER_MONTH",
    amount: 49000,
    credits: 50,
  });
  expect(s.completePayment(12345, 1000)).toBeNull(); // wrong amount
  expect(s.completePayment(12345, 49000)?.status).toBe("PAID");
  expect(s.completePayment(12345, 49000)).toBeNull(); // webhook repeated
  expect(s.completePayment(999, 49000)).toBeNull(); // unknown order
  expect(s.balance(user.id)).toBe(50);
  expect(s.payment(12345)?.paidAt).toBe(1_000);
});

it("logs AI calls and sums tokens per model", () => {
  const s = store();
  const { user } = s.upsertUser(google());
  for (const ok of [true, false])
    s.recordAiCall({
      userId: user.id,
      model: "claude-haiku-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      ok,
      error: ok ? "" : "AI_BUSY",
      ms: 10,
    });
  expect(s.usageSummary()).toEqual([
    { model: "claude-haiku-5-5", calls: 2, ok: 1, input: 2000, output: 400 },
  ]);
});

it("keeps everything in a file across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "store-"));
  try {
    const path = join(dir, "app.db");
    const a = new Store(path);
    const { user } = a.upsertUser(google());
    a.addCredits(user.id, 10, "welcome", user.id);
    a.close();
    const b = new Store(path);
    expect(b.balance(user.id)).toBe(10);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
