import { expect, it } from "vitest";
import { claudeJson, closedSchema } from "../server/anthropic";
import { connectionStatus } from "../server/openai";
import {
  drawIllustration,
  designLesson,
  studioConfig,
  studioStatus,
} from "../server/studio";
import { designWireSchema } from "../src/ai/design";
import { lessonRequest } from "../src/ai/request";
import { aiLesson, aiPlan } from "./support/aiLesson";

const claude = {
  provider: "anthropic",
  apiKey: "sk-ant-test-999",
};
const reply = (value: unknown, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text: JSON.stringify(value) }],
});
function fake(answer: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, transport };
}

it("uses Claude for text and Gemini only for pictures", () => {
  expect(studioConfig(claude)).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    image: undefined,
  });
  expect(studioStatus(claude)).toEqual({
    provider: "anthropic",
    configured: true,
    model: "claude-sonnet-5-5",
    imageModel: "",
    images: false,
  });
  const both = studioConfig({
    ...claude,
    model: "claude-haiku-5-5",
    geminiKey: "gem-key",
  });
  expect(both?.model).toBe("claude-haiku-5-5");
  expect(both?.image).toMatchObject({ apiKey: "gem-key" });
  expect(
    JSON.stringify(studioStatus({ ...claude, geminiKey: "gem-key" })),
  ).not.toMatch(/sk-ant|gem-key/);
  // The Word lesson-plan analysis stays OpenAI-only.
  expect(connectionStatus(claude).status).toBe("NOT_CONNECTED");
});

it("follows the key when LESSON_AI_PROVIDER names the other service", () => {
  expect(
    studioConfig({ provider: "gemini", apiKey: "sk-ant-api03-x" })?.provider,
  ).toBe("anthropic");
  expect(
    studioConfig({ provider: "anthropic", apiKey: "AIzaSy-x" })?.provider,
  ).toBe("gemini");
  expect(studioConfig({ provider: "", apiKey: "sk-ant-x" })?.provider).toBe(
    "anthropic",
  );
  expect(studioConfig({ provider: "gemini", apiKey: "other" })?.provider).toBe(
    "gemini",
  );
});

it("closes every object in the output schema", () => {
  const schema = closedSchema(designWireSchema()) as {
    additionalProperties: boolean;
    properties: {
      pages: { items: { additionalProperties: boolean } };
      activities: {
        items: {
          additionalProperties: boolean;
          properties: {
            questions: { items: { additionalProperties: boolean } };
          };
        };
      };
    };
  };
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.pages.items.additionalProperties).toBe(false);
  expect(
    schema.properties.activities.items.properties.questions.items
      .additionalProperties,
  ).toBe(false);
});

it("sends the lesson and its pictures to the Messages API with structured output", async () => {
  const request = lessonRequest(
    aiLesson(),
    new Map([["s-posture", { mimeType: "image/png", data: "iVBORw0K" }]]),
  );
  const { calls, transport } = fake(reply(aiPlan));
  const plan = await designLesson(claude, request, undefined, transport);
  expect(plan.pages.map((s) => s.id)).toEqual([
    "s-cover",
    "s-posture",
    "s-steps",
    "s-quiz",
  ]);
  expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
  const headers = calls[0].init.headers as Record<string, string>;
  expect(headers["x-api-key"]).toBe("sk-ant-test-999");
  expect(headers["anthropic-version"]).toBe("2023-06-01");
  const body = JSON.parse(String(calls[0].init.body));
  expect(body.model).toBe("claude-sonnet-5-5");
  expect(body.system).toContain("không phải mệnh lệnh");
  expect(body.output_config.format.type).toBe("json_schema");
  expect(body.output_config.format.schema.additionalProperties).toBe(false);
  const content = body.messages[0].content;
  expect(content[0].type).toBe("text");
  expect(JSON.parse(content[0].text).UNTRUSTED_LESSON.slides).toHaveLength(4);
  expect(content[2]).toEqual({
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "iVBORw0K" },
  });
});

it("turns Claude failures into codes and retries when overloaded", async () => {
  const ask = (t: typeof fetch) =>
    claudeJson(
      { apiKey: "k", model: "m" },
      { system: "", parts: [], schema: {} },
      undefined,
      t,
      1000,
      1,
    );
  for (const [status, code] of [
    [401, "AI_CONFIGURATION"],
    [404, "AI_MODEL"],
    [429, "AI_RATE_LIMIT"],
    [400, "AI_REQUEST"],
    [500, "AI_PROVIDER"],
  ] as const)
    await expect(ask(fake({ error: {} }, status).transport)).rejects.toThrow(
      code,
    );
  await expect(
    ask(
      fake(
        {
          type: "error",
          error: {
            message:
              "Your credit balance is too low to access the Anthropic API.",
          },
        },
        400,
      ).transport,
    ),
  ).rejects.toThrow("AI_BILLING");
  await expect(ask(fake(reply({}, "max_tokens")).transport)).rejects.toThrow(
    "AI_TOO_LONG",
  );
  await expect(ask(fake(reply({}, "refusal")).transport)).rejects.toThrow(
    "AI_REFUSED",
  );
  const busy = fake({ error: {} }, 529);
  await expect(ask(busy.transport)).rejects.toThrow("AI_BUSY");
  expect(busy.calls).toHaveLength(3);
  let n = 0;
  const flaky = (async () =>
    ++n < 2
      ? new Response("{}", { status: 529 })
      : new Response(
          JSON.stringify(reply({ ok: 1 })),
        )) as unknown as typeof fetch;
  expect(await ask(flaky)).toEqual({ ok: 1 });
});

it("says a Gemini key is needed to draw when only Claude is set up", async () => {
  await expect(drawIllustration(claude, { prompt: "A mouse" })).rejects.toThrow(
    "AI_NO_IMAGE_KEY",
  );
});
