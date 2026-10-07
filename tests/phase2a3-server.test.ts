import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAiMiddleware } from "../server/localAiPlugin";
import { strictOutputSchema } from "../server/openai";

const server = createServer((req, res) => { void localAiMiddleware({})(req, res, () => { res.statusCode = 404; res.end(); }); });
let url: string;
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
describe("local server boundary", () => {
  it("returns only public configuration status with no key", async () => {
    const res = await fetch(`${url}/api/lesson-ai/status`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ providerId: "openai", model: "", configured: false, status: "NOT_CONNECTED" });
  });
  it("blocks cross-origin callers", async () => {
    expect((await fetch(`${url}/api/lesson-ai/status`, { headers: { Origin: "https://untrusted.example" } })).status).toBe(403);
  });
  it("rejects non-JSON requests", async () => {
    expect((await fetch(`${url}/api/lesson-ai/analyze`, { method: "POST", body: "content" })).status).toBe(415);
  });
  it("rejects missing structured blocks", async () => {
    expect((await fetch(`${url}/api/lesson-ai/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(400);
  });
  it("rejects oversized bodies", async () => {
    expect((await fetch(`${url}/api/lesson-ai/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(2_000_001) })).status).toBe(413);
  });
  it("makes every strict output object closed with all properties required", () => {
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.properties) {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties));
      }
      Object.values(node).forEach(visit);
    };
    visit(strictOutputSchema());
  });
});
