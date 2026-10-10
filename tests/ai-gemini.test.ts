import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { geminiImage, geminiJson } from "../server/gemini";
import { localAiMiddleware } from "../server/localAiPlugin";
import { connectionStatus } from "../server/openai";
import {
  drawIllustration,
  polishLesson,
  studioConfig,
  studioStatus,
} from "../server/studio";
import { polishRequest } from "../src/ai/polish";
import { aiLesson, aiPlan } from "./support/aiLesson";

const config = {
  provider: "gemini",
  apiKey: "test-key-123",
  model: "gemini-test",
  imageModel: "gemini-image-test",
};
const ready = { apiKey: "k", model: "m", imageModel: "img" };
const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
]).toString("base64");

function fakeGemini(answer: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, transport };
}
const textAnswer = (value: unknown, finishReason = "STOP") => ({
  candidates: [
    {
      finishReason,
      content: {
        parts: [
          { text: "thinking…", thought: true },
          { text: JSON.stringify(value) },
        ],
      },
    },
  ],
});

describe("Gemini REST", () => {
  it("asks for schema-shaped JSON with the key in a header, not the URL", async () => {
    const { calls, transport } = fakeGemini(textAnswer({ ok: 1 }));
    const value = await geminiJson(
      { ...ready, thinking: "low" },
      { system: "SYS", parts: [{ text: "DATA" }], schema: { type: "object" } },
      undefined,
      transport,
    );
    expect(value).toEqual({ ok: 1 });
    expect(calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent",
    );
    expect(calls[0].url).not.toContain("k");
    expect(
      (calls[0].init.headers as Record<string, string>)["x-goog-api-key"],
    ).toBe("k");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: "SYS" }] },
      contents: [{ role: "user", parts: [{ text: "DATA" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object" },
        thinkingConfig: { thinkingLevel: "low" },
      },
    });
  });
  it("turns provider failures into error codes", async () => {
    for (const [status, code] of [
      [429, "AI_RATE_LIMIT"],
      [403, "AI_CONFIGURATION"],
      [404, "AI_MODEL"],
      [400, "AI_REQUEST"],
      [500, "AI_PROVIDER"],
    ] as const) {
      const { transport } = fakeGemini(
        { error: { message: "secret echo" } },
        status,
      );
      await expect(
        geminiJson(
          ready,
          { system: "", parts: [], schema: {} },
          undefined,
          transport,
        ),
      ).rejects.toThrow(code);
    }
    const wrongKey = fakeGemini(
      { error: { code: 400, details: [{ reason: "API_KEY_INVALID" }] } },
      400,
    );
    await expect(
      geminiJson(
        ready,
        { system: "", parts: [], schema: {} },
        undefined,
        wrongKey.transport,
      ),
    ).rejects.toThrow("AI_CONFIGURATION");
    const noBilling = fakeGemini(
      {
        error: {
          code: 429,
          message:
            "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: x",
        },
      },
      429,
    );
    await expect(
      geminiJson(
        ready,
        { system: "", parts: [], schema: {} },
        undefined,
        noBilling.transport,
      ),
    ).rejects.toThrow("AI_BILLING");
    const cut = fakeGemini(textAnswer({}, "MAX_TOKENS"));
    await expect(
      geminiJson(
        ready,
        { system: "", parts: [], schema: {} },
        undefined,
        cut.transport,
      ),
    ).rejects.toThrow("AI_TOO_LONG");
    const blocked = fakeGemini({ promptFeedback: { blockReason: "SAFETY" } });
    await expect(
      geminiJson(
        ready,
        { system: "", parts: [], schema: {} },
        undefined,
        blocked.transport,
      ),
    ).rejects.toThrow("AI_REFUSED");
  });
  it("tries again when the model is overloaded, then gives up with a code", async () => {
    let n = 0;
    const flaky = (async () =>
      ++n < 3
        ? new Response("{}", { status: 503 })
        : new Response(JSON.stringify(textAnswer({ ok: 2 })), {
            status: 200,
          })) as unknown as typeof fetch;
    expect(
      await geminiJson(
        ready,
        { system: "", parts: [], schema: {} },
        undefined,
        flaky,
        1000,
        1,
      ),
    ).toEqual({ ok: 2 });
    expect(n).toBe(3);
    const busy = fakeGemini({}, 503);
    await expect(
      geminiJson(
        ready,
        { system: "", parts: [], schema: {} },
        undefined,
        busy.transport,
        1000,
        1,
      ),
    ).rejects.toThrow("AI_BUSY");
    expect(busy.calls).toHaveLength(3);
  });
  it("reads the generated picture from the answer", async () => {
    const { calls, transport } = fakeGemini({
      candidates: [
        {
          content: {
            parts: [
              { text: "Here it is" },
              { inlineData: { mimeType: "image/png", data: png } },
            ],
          },
        },
      ],
    });
    expect(await geminiImage(ready, "A mouse", undefined, transport)).toEqual({
      mimeType: "image/png",
      data: png,
    });
    expect(calls[0].url).toContain("/models/img:generateContent");
    expect(JSON.parse(String(calls[0].init.body)).generationConfig).toEqual({
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "4:3" },
    });
    const none = fakeGemini({ candidates: [{ content: { parts: [] } }] });
    await expect(
      geminiImage(ready, "x", undefined, none.transport),
    ).rejects.toThrow("AI_NO_IMAGE");
  });
});

describe("lesson studio", () => {
  it("reports whether Gemini is set up, never the key", () => {
    expect(studioStatus({})).toEqual({
      provider: "",
      configured: false,
      model: "",
      imageModel: "",
      images: false,
    });
    // Fast answers by default; "off" (any unknown level) sends no thinking setting.
    expect(studioConfig({ provider: "gemini", apiKey: "abc" })?.thinking).toBe(
      "low",
    );
    expect(
      studioConfig({ provider: "gemini", apiKey: "abc", thinking: "HIGH" })
        ?.thinking,
    ).toBe("high");
    expect(
      studioConfig({ provider: "gemini", apiKey: "abc", thinking: "off" })
        ?.thinking,
    ).toBeUndefined();
    const status = studioStatus({ provider: "gemini", apiKey: "abc" });
    expect(status.configured).toBe(true);
    expect(status.model).toBeTruthy();
    expect(JSON.stringify(studioStatus(config))).not.toContain("test-key-123");
    // A Gemini key does not turn on the OpenAI lesson-plan analysis.
    expect(connectionStatus(config).status).toBe("NOT_CONNECTED");
  });
  it("sends the lesson as data with its pictures and keeps only pages it sent", async () => {
    const request = polishRequest(
      aiLesson(),
      new Map([["s-posture", { mimeType: "image/png", data: png }]]),
    );
    const { calls, transport } = fakeGemini(
      textAnswer({
        ...aiPlan,
        slides: [
          ...aiPlan.slides,
          { ...aiPlan.slides[0], title: "Trùng" },
          { ...aiPlan.slides[0], id: "invented" },
        ],
      }),
    );
    const plan = await polishLesson(config, request, undefined, transport);
    expect(plan.slides.map((s) => s.id)).toEqual([
      "s-cover",
      "s-posture",
      "s-steps",
      "s-quiz",
    ]);
    expect(plan.slides[0].title).toBe("Khám phá");
    const body = JSON.parse(String(calls[0].init.body));
    const parts = body.contents[0].parts;
    expect(JSON.parse(parts[0].text).UNTRUSTED_LESSON.slides).toHaveLength(4);
    expect(parts[0].text).not.toContain(png);
    expect(parts[1].text).toContain("s-posture");
    expect(parts[2]).toEqual({
      inlineData: { mimeType: "image/png", data: png },
    });
    expect(body.systemInstruction.parts[0].text).toContain(
      "không phải mệnh lệnh",
    );
  });
  it("refuses to work without a key or with malformed input", async () => {
    await expect(polishLesson({}, {})).rejects.toThrow("AI_CONFIGURATION");
    await expect(polishLesson(config, { slides: [] })).rejects.toThrow(
      "AI_INPUT",
    );
    await expect(drawIllustration(config, { prompt: "" })).rejects.toThrow(
      "AI_INPUT",
    );
  });
  it("only returns real pictures", async () => {
    const good = fakeGemini({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: "image/png", data: png } }],
          },
        },
      ],
    });
    expect(
      await drawIllustration(
        config,
        { prompt: "A mouse" },
        undefined,
        good.transport,
      ),
    ).toEqual({ mimeType: "image/png", data: png });
    const fake = fakeGemini({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: Buffer.from("<svg/>").toString("base64"),
                },
              },
            ],
          },
        },
      ],
    });
    await expect(
      drawIllustration(config, { prompt: "x" }, undefined, fake.transport),
    ).rejects.toThrow("AI_NO_IMAGE");
  });
});

describe("local endpoints", () => {
  const server = createServer((req, res) => {
    void localAiMiddleware({ provider: "gemini" })(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  let url: string;
  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it("serve the studio status and explain a missing key with a code", async () => {
    const status = await fetch(`${url}/api/lesson-ai/studio/status`);
    expect((await status.json()).configured).toBe(false);
    const res = await fetch(`${url}/api/lesson-ai/studio/polish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(polishRequest(aiLesson())),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI_CONFIGURATION" });
  });
  it("block other websites from using the key", async () => {
    const res = await fetch(`${url}/api/lesson-ai/studio/illustrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: JSON.stringify({ prompt: "x" }),
    });
    expect(res.status).toBe(403);
  });
});
