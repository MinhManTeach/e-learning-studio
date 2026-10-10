// Claude (Anthropic API key) over plain REST: structured JSON answers with
// page pictures as input. Claude does not draw pictures. Server-only.
import type { GeminiPart } from "./gemini";

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}
const endpoint = "https://api.anthropic.com/v1/messages";

function failure(status: number) {
  return new Error(
    status === 429
      ? "AI_RATE_LIMIT"
      : status === 400
        ? "AI_REQUEST"
        : status === 401 || status === 403
          ? "AI_CONFIGURATION"
          : status === 404
            ? "AI_MODEL"
            : status === 529 || status === 503
              ? "AI_BUSY"
              : "AI_PROVIDER",
  );
}
/** Structured outputs need every object closed; lengths are clipped on arrival instead. */
export function closedSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closedSchema);
  if (!schema || typeof schema !== "object") return schema;
  const node = Object.fromEntries(
    Object.entries(schema).map(([k, v]) => [k, closedSchema(v)]),
  );
  if (node.type === "object") node.additionalProperties = false;
  return node;
}
const toContent = (parts: GeminiPart[]) =>
  parts.map((p) =>
    "text" in p
      ? { type: "text", text: p.text }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: p.inlineData.mimeType,
            data: p.inlineData.data,
          },
        },
  );

async function once(
  config: ClaudeConfig,
  request: { system: string; parts: GeminiPart[]; schema: object },
  signal: AbortSignal | undefined,
  transport: typeof fetch,
  timeoutMs: number,
) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await transport(endpoint, {
      method: "POST",
      signal: requestSignal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 32000,
        system: request.system,
        messages: [{ role: "user", content: toContent(request.parts) }],
        output_config: {
          format: { type: "json_schema", schema: closedSchema(request.schema) },
        },
      }),
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error(timeout.aborted ? "AI_TIMEOUT" : "AI_NETWORK");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // An account without credits answers 400 "credit balance is too low".
    if (/credit balance/i.test(detail)) throw new Error("AI_BILLING");
    throw failure(response.status);
  }
  const message = (await response.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (message.stop_reason === "max_tokens") throw new Error("AI_TOO_LONG");
  if (message.stop_reason !== "end_turn") throw new Error("AI_REFUSED");
  const text = (message.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("AI_INVALID_RESPONSE");
  }
}

export async function claudeJson(
  config: ClaudeConfig,
  request: { system: string; parts: GeminiPart[]; schema: object },
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
  timeoutMs = 300_000,
  retryDelayMs = 3000,
): Promise<unknown> {
  // "Overloaded" answers are not processed (nor billed): try twice more.
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(config, request, signal, transport, timeoutMs);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "AI_BUSY" ||
        attempt >= 2
      )
        throw error;
      await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
      signal?.throwIfAborted();
    }
  }
}
