import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { localAiMiddleware } from "../server/localAiPlugin";
import { createProject } from "../src/model/factories";
const server = createServer((req, res) => {
  void localAiMiddleware({})(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});
let url: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lesson-ai/enhance`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
it("extends the same protected local adapter and rejects cross-origin enhancement", async () => {
  const result = await fetch(url, {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createProject()),
  });
  expect(result.status).toBe(403);
});
it("rejects malformed projects and sanitizes unconfigured-provider errors", async () => {
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(400);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createProject()),
  });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "AI_UNAVAILABLE" });
});
