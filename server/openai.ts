import {
  aiAnalysisJsonSchema,
  aiPedagogicalAnalysisResultSchema,
  type SemanticAnalysisInput,
} from "../src/import/semantic";
import { semanticInstruction } from "./instruction";

export interface LocalAiConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
}
export function connectionStatus(config: LocalAiConfig) {
  const present = Boolean(config.provider || config.model || config.apiKey);
  const configured =
    config.provider === "openai" &&
    Boolean(config.apiKey?.trim()) &&
    /^[a-zA-Z0-9._:-]{1,120}$/.test(config.model ?? "");
  return {
    providerId: "openai",
    model:
      config.model && /^[a-zA-Z0-9._:-]{1,120}$/.test(config.model)
        ? config.model
        : "",
    configured,
    status: configured ? "CONFIGURED" : present ? "INVALID" : "NOT_CONNECTED",
  };
}

// OpenAI strict structured output requires every property, including optional fields.
// Represent optional fields as nullable on the wire; normalize them before the existing contract.
export function strictOutputSchema() {
  const schema = aiAnalysisJsonSchema() as Record<string, unknown>;
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.properties) {
      const properties = node.properties as Record<string, unknown>;
      const required = (node.required ?? []) as string[];
      for (const key of Object.keys(properties)) {
        visit(properties[key]);
        if (!required.includes(key))
          properties[key] = { anyOf: [properties[key], { type: "null" }] };
      }
      node.required = Object.keys(properties);
      node.additionalProperties = false;
    }
    if (node.items) visit(node.items);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(visit);
  }
  visit(schema);
  delete schema.$schema;
  return schema;
}
function normalizeWireResult(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const result = value as Record<string, unknown>;
  if (result.lessonIdentity && typeof result.lessonIdentity === "object")
    for (const [key, v] of Object.entries(result.lessonIdentity))
      if (v === null)
        delete (result.lessonIdentity as Record<string, unknown>)[key];
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if ((node as Record<string, unknown>).reasoningCode === null)
      delete (node as Record<string, unknown>).reasoningCode;
    Object.values(node).forEach(visit);
  }
  visit(result);
  return result;
}
export async function analyzeWithOpenAi(
  config: LocalAiConfig,
  input: SemanticAnalysisInput,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
  timeoutMs = 60_000,
) {
  if (!connectionStatus(config).configured) throw new Error("AI_CONFIGURATION");
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await transport(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          store: false,
          messages: [
            { role: "system", content: semanticInstruction },
            {
              role: "user",
              content: JSON.stringify({
                UNTRUSTED_DOCUMENT_DATA: {
                  version: input.version,
                  documentId: input.documentId,
                  sourceType: input.sourceType,
                  blocks: input.blocks,
                  structuralHints: input.structuralHints,
                },
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "lesson_plan_analysis",
              strict: true,
              schema: strictOutputSchema(),
            },
          },
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "AI_RATE_LIMIT"
          : response.status === 401 || response.status === 403
            ? "AI_CONFIGURATION"
            : "AI_PROVIDER",
      );
    const envelope = await response.json();
    const choice = envelope.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      choice.message?.refusal ||
      typeof choice.message?.content !== "string"
    )
      throw new Error("AI_INVALID_RESPONSE");
    let value: unknown;
    try {
      value = JSON.parse(choice.message.content);
    } catch {
      throw new Error("AI_INVALID_RESPONSE");
    }
    const parsed = aiPedagogicalAnalysisResultSchema.safeParse(
      normalizeWireResult(value),
    );
    if (!parsed.success) throw new Error("AI_INVALID_RESPONSE");
    signal?.throwIfAborted();
    return parsed.data;
  } catch (error) {
    signal?.throwIfAborted();
    if (timedOut) throw new Error("AI_TIMEOUT");
    if (
      error instanceof Error &&
      /^AI_(CONFIGURATION|RATE_LIMIT|PROVIDER|INVALID_RESPONSE)$/.test(
        error.message,
      )
    )
      throw error;
    throw new Error("AI_NETWORK");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
