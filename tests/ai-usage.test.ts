import { expect, it } from "vitest";
import { designLesson } from "../server/studio";
import { claudeUsage, geminiUsage, usageLine } from "../server/usage";
import { lessonRequest } from "../src/ai/request";
import { aiLesson, aiPlan } from "./support/aiLesson";

const claude = { provider: "anthropic", apiKey: "sk-ant-test-999" };
const gemini = { provider: "gemini", apiKey: "AIza-test-key-123" };
const respond = (answer: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(answer), {
      status,
    })) as unknown as typeof fetch;
const request = () => lessonRequest(aiLesson(), new Map());

it("prints how many tokens a Claude lesson design used, and nothing of the lesson", async () => {
  const lines: string[] = [];
  await designLesson(
    claude,
    request(),
    undefined,
    respond({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(aiPlan) }],
      usage: {
        input_tokens: 41200,
        cache_read_input_tokens: 800,
        output_tokens: 9050,
      },
    }),
    (line) => lines.push(line),
  );
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/claude-sonnet-5-5/);
  expect(lines[0]).toMatch(/42\.000 token vào/);
  expect(lines[0]).toMatch(/9\.050 token ra/);
  expect(lines[0]).not.toMatch(/Tư thế|UNTRUSTED/);
});

it("still reports the tokens when the answer cannot be used, since they are billed", async () => {
  const lines: string[] = [];
  await expect(
    designLesson(
      claude,
      request(),
      undefined,
      respond({
        stop_reason: "max_tokens",
        content: [],
        usage: { input_tokens: 1000, output_tokens: 32000 },
      }),
      (line) => lines.push(line),
    ),
  ).rejects.toThrow("AI_TOO_LONG");
  expect(lines[0]).toMatch(/32\.000 token ra/);
});

it("counts Gemini thinking tokens as output", async () => {
  const lines: string[] = [];
  await designLesson(
    gemini,
    request(),
    undefined,
    respond({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(aiPlan) }] },
        },
      ],
      usageMetadata: {
        promptTokenCount: 30000,
        candidatesTokenCount: 7000,
        thoughtsTokenCount: 1500,
      },
    }),
    (line) => lines.push(line),
  );
  expect(lines[0]).toMatch(/30\.000 token vào, 8\.500 token ra/);
});

it("prints nothing when the service never answered", async () => {
  const lines: string[] = [];
  await expect(
    designLesson(
      claude,
      request(),
      undefined,
      respond({ error: { message: "bad key" } }, 401),
      (line) => lines.push(line),
    ),
  ).rejects.toThrow("AI_CONFIGURATION");
  expect(lines).toEqual([]);
});

it("reads usage blocks defensively", () => {
  expect(claudeUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 });
  expect(
    geminiUsage({ promptTokenCount: "x", candidatesTokenCount: -5 }),
  ).toEqual({
    inputTokens: 0,
    outputTokens: 0,
  });
  expect(
    usageLine("Thử", "m", { inputTokens: 1234, outputTokens: 5 }, 76_400),
  ).toBe("[Thử] m: 1.234 token vào, 5 token ra, 76 giây");
});
