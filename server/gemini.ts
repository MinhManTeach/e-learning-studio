// Google Gemini (AI Studio key) over plain REST: structured JSON answers and
// picture generation. Server-only; the key never reaches the browser.
export interface GeminiConfig {
  apiKey: string;
  model: string;
  imageModel: string;
  /** Gemini 3 "thinking level"; "low" answers several times faster. */
  thinking?: "minimal" | "low" | "medium" | "high";
}
const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

export type GeminiPart =
  { text: string } | { inlineData: { mimeType: string; data: string } };

/** Error codes only; provider messages are never passed on (they may echo input). */
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
            : status === 503
              ? "AI_BUSY"
              : "AI_PROVIDER",
  );
}
async function call(
  config: GeminiConfig,
  model: string,
  body: unknown,
  signal: AbortSignal | undefined,
  transport: typeof fetch,
  timeoutMs: number,
  retryDelayMs = 3000,
) {
  // "Model overloaded" answers are not processed (nor billed): try twice more.
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(config, model, body, signal, transport, timeoutMs);
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
async function callOnce(
  config: GeminiConfig,
  model: string,
  body: unknown,
  signal: AbortSignal | undefined,
  transport: typeof fetch,
  timeoutMs: number,
) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await transport(endpoint(model), {
      method: "POST",
      signal: requestSignal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error(timeout.aborted ? "AI_TIMEOUT" : "AI_NETWORK");
  }
  if (!response.ok) throw failure(response.status);
  const envelope = (await response.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: {
      finishReason?: string;
      content?: { parts?: (GeminiPart & { thought?: boolean })[] };
    }[];
  };
  const candidate = envelope.candidates?.[0];
  if (envelope.promptFeedback?.blockReason || !candidate)
    throw new Error("AI_REFUSED");
  return candidate;
}

export async function geminiJson(
  config: GeminiConfig,
  request: { system: string; parts: GeminiPart[]; schema: object },
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
  timeoutMs = 180_000,
  retryDelayMs = 3000,
): Promise<unknown> {
  const candidate = await call(
    config,
    config.model,
    {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: request.parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: request.schema,
        temperature: 0.4,
        ...(config.thinking
          ? { thinkingConfig: { thinkingLevel: config.thinking } }
          : {}),
      },
    },
    signal,
    transport,
    timeoutMs,
    retryDelayMs,
  );
  if (candidate.finishReason && candidate.finishReason !== "STOP")
    throw new Error(
      candidate.finishReason === "MAX_TOKENS" ? "AI_TOO_LONG" : "AI_REFUSED",
    );
  const text = (candidate.content?.parts ?? [])
    .filter(
      (p): p is { text: string; thought?: boolean } =>
        "text" in p && !p.thought,
    )
    .map((p) => p.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("AI_INVALID_RESPONSE");
  }
}

export async function geminiImage(
  config: GeminiConfig,
  prompt: string,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
  timeoutMs = 120_000,
  retryDelayMs = 3000,
): Promise<{ mimeType: string; data: string }> {
  const candidate = await call(
    config,
    config.imageModel,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "4:3" },
      },
    },
    signal,
    transport,
    timeoutMs,
    retryDelayMs,
  );
  const image = (candidate.content?.parts ?? []).find(
    (p): p is { inlineData: { mimeType: string; data: string } } =>
      "inlineData" in p &&
      /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType),
  );
  if (!image) throw new Error("AI_NO_IMAGE");
  return image.inlineData;
}
