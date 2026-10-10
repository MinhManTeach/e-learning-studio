/** Tokens one AI call used, to work out what a lesson really costs. */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}
export type UsageListener = (usage: AiUsage) => void;

const count = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

/** Claude's `usage` block; cached input still counts as input read. */
export function claudeUsage(raw: unknown): AiUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  return {
    inputTokens:
      count(u.input_tokens) +
      count(u.cache_read_input_tokens) +
      count(u.cache_creation_input_tokens),
    outputTokens: count(u.output_tokens),
  };
}
/** Gemini's `usageMetadata`; thinking tokens are billed as output. */
export function geminiUsage(raw: unknown): AiUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  return {
    inputTokens: count(u.promptTokenCount),
    outputTokens: count(u.candidatesTokenCount) + count(u.thoughtsTokenCount),
  };
}

const number = (n: number) => n.toLocaleString("vi-VN");
/** One line for the server console. Never includes lesson content. */
export function usageLine(
  task: string,
  model: string,
  usage: AiUsage,
  ms: number,
) {
  return `[${task}] ${model}: ${number(usage.inputTokens)} token vào, ${number(usage.outputTokens)} token ra, ${Math.round(ms / 1000)} giây`;
}
