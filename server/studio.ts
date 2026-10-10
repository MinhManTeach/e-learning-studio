// "AI làm đẹp bài giảng" on the local server: page rewrites (Gemini or Claude)
// and new pictures (Gemini) with the teacher's own keys from .env.local.
import {
  polishInstruction,
  polishPlanSchema,
  polishRequestSchema,
  polishWireSchema,
} from "../src/ai/polish";
import { detectImageMime } from "../src/media/storage";
import { claudeJson } from "./anthropic";
import { geminiImage, geminiJson, type GeminiPart } from "./gemini";
import type { LocalAiConfig } from "./openai";

const modelName = /^[a-zA-Z0-9._:-]{1,120}$/;
export const defaultGeminiModel = "gemini-3.8-flash";
export const defaultGeminiImageModel = "gemini-nano-banana-2.1";
export const defaultClaudeModel = "claude-sonnet-5-5";

/**
 * Text comes from Gemini or Claude (LESSON_AI_PROVIDER). Pictures always come
 * from Gemini: its own key, or LESSON_AI_GEMINI_KEY next to a Claude key.
 */
/** Which service a key belongs to, from its well-known prefix. */
export function keyProvider(key: string | undefined) {
  if (key?.startsWith("sk-ant-")) return "anthropic";
  if (key?.startsWith("AIza")) return "gemini";
  return undefined;
}
export function studioConfig(config: LocalAiConfig) {
  const key = config.apiKey?.trim();
  // A recognisable key decides the service, so a pasted Claude key works even
  // if LESSON_AI_PROVIDER still says gemini (and the other way round).
  const provider = keyProvider(key) ?? config.provider?.trim().toLowerCase();
  if (!key || (provider !== "gemini" && provider !== "anthropic"))
    return undefined;
  const claude = provider === "anthropic";
  const model =
    config.model?.trim() || (claude ? defaultClaudeModel : defaultGeminiModel);
  const imageModel = config.imageModel?.trim() || defaultGeminiImageModel;
  if (!modelName.test(model) || !modelName.test(imageModel)) return undefined;
  const level = config.thinking?.trim().toLowerCase() || "low";
  const thinking = (["minimal", "low", "medium", "high"] as const).find(
    (t) => t === level,
  );
  const geminiKey = claude ? config.geminiKey?.trim() : key;
  return {
    provider: claude ? ("anthropic" as const) : ("gemini" as const),
    apiKey: key,
    model,
    thinking,
    image: geminiKey
      ? { apiKey: geminiKey, model: imageModel, imageModel }
      : undefined,
  };
}
export function studioStatus(config: LocalAiConfig) {
  const ready = studioConfig(config);
  return {
    provider: ready?.provider ?? "",
    configured: !!ready,
    model: ready?.model ?? "",
    imageModel: ready?.image?.imageModel ?? "",
    images: !!ready?.image,
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
  const prompt = {
    system: polishInstruction,
    parts,
    schema: polishWireSchema(),
  };
  const answer =
    ready.provider === "anthropic"
      ? await claudeJson(ready, prompt, signal, transport)
      : await geminiJson(
          { ...ready, imageModel: ready.image?.imageModel ?? "" },
          prompt,
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
  if (!ready.image) throw new Error("AI_NO_IMAGE_KEY");
  const image = await geminiImage(ready.image, prompt, signal, transport);
  const bytes = Buffer.from(image.data, "base64");
  const mimeType = detectImageMime(new Uint8Array(bytes.subarray(0, 16)));
  if (!mimeType) throw new Error("AI_NO_IMAGE");
  return { mimeType, data: bytes.toString("base64") };
}
