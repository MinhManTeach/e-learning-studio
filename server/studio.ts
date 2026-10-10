// "AI làm đẹp bài giảng" on the local server: page rewrites and new pictures
// with the teacher's own Gemini key (from .env.local).
import {
  polishInstruction,
  polishPlanSchema,
  polishRequestSchema,
  polishWireSchema,
} from "../src/ai/polish";
import { detectImageMime } from "../src/media/storage";
import { geminiImage, geminiJson, type GeminiPart } from "./gemini";
import type { LocalAiConfig } from "./openai";

const modelName = /^[a-zA-Z0-9._:-]{1,120}$/;
export const defaultGeminiModel = "gemini-3.8-flash";
export const defaultGeminiImageModel = "gemini-nano-banana-2.1";

export function studioConfig(config: LocalAiConfig) {
  if (config.provider !== "gemini" || !config.apiKey?.trim()) return undefined;
  const model = config.model?.trim() || defaultGeminiModel;
  const imageModel = config.imageModel?.trim() || defaultGeminiImageModel;
  if (!modelName.test(model) || !modelName.test(imageModel)) return undefined;
  return { apiKey: config.apiKey.trim(), model, imageModel };
}
export function studioStatus(config: LocalAiConfig) {
  const ready = studioConfig(config);
  return {
    provider: "gemini" as const,
    configured: !!ready,
    model: ready?.model ?? "",
    imageModel: ready?.imageModel ?? "",
  };
}

export async function polishLesson(
  config: LocalAiConfig,
  body: unknown,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const ready = studioConfig(config);
  if (!ready) throw new Error("AI_CONFIGURATION");
  const parsed = polishRequestSchema.safeParse(body);
  if (!parsed.success) throw new Error("AI_INPUT");
  const { images, ...lesson } = parsed.data;
  const parts: GeminiPart[] = [
    { text: JSON.stringify({ UNTRUSTED_LESSON: lesson }) },
  ];
  images.forEach((image, i) => {
    const slide = lesson.slides.find((s) => s.image === i);
    parts.push({ text: `Ảnh #${i} của trang id "${slide?.id ?? "?"}":` });
    parts.push({ inlineData: image });
  });
  const answer = await geminiJson(
    ready,
    { system: polishInstruction, parts, schema: polishWireSchema() },
    signal,
    transport,
  );
  const plan = polishPlanSchema.safeParse(answer);
  if (!plan.success) throw new Error("AI_INVALID_RESPONSE");
  // Keep only pages that were sent, once each.
  const ids = new Set(lesson.slides.map((s) => s.id));
  const seen = new Set<string>();
  return {
    ...plan.data,
    slides: plan.data.slides.filter(
      (s) => ids.has(s.id) && !seen.has(s.id) && seen.add(s.id),
    ),
  };
}

export async function drawIllustration(
  config: LocalAiConfig,
  body: unknown,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const ready = studioConfig(config);
  if (!ready) throw new Error("AI_CONFIGURATION");
  const prompt =
    body && typeof body === "object" && "prompt" in body
      ? (body as { prompt: unknown }).prompt
      : undefined;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 3000)
    throw new Error("AI_INPUT");
  const image = await geminiImage(ready, prompt, signal, transport);
  const bytes = Buffer.from(image.data, "base64");
  const mimeType = detectImageMime(new Uint8Array(bytes.subarray(0, 16)));
  if (!mimeType) throw new Error("AI_NO_IMAGE");
  return { mimeType, data: bytes.toString("base64") };
}
