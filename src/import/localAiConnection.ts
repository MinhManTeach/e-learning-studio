import { z } from "zod";
import {
  LessonAnalysisService,
  SemanticLessonAnalysisProvider,
  type SemanticAnalysisConnection,
} from "./analysisService";
import type { LessonAnalysisOptions } from "./model";
import type { SemanticAnalysisInput } from "./semantic";
export const localConnectionStatusSchema = z.object({
  providerId: z.literal("openai"),
  model: z.string(),
  configured: z.boolean(),
  status: z.enum(["CONFIGURED", "NOT_CONNECTED", "INVALID"]),
});
export type LocalConnectionStatus = z.infer<typeof localConnectionStatusSchema>;
export async function readLocalAiStatus(
  signal?: AbortSignal,
): Promise<LocalConnectionStatus> {
  try {
    const response = await fetch("/api/lesson-ai/status", {
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    return localConnectionStatusSchema.parse(await response.json());
  } catch {
    signal?.throwIfAborted();
    return {
      providerId: "openai",
      model: "",
      configured: false,
      status: "NOT_CONNECTED",
    };
  }
}
export class LocalServerSemanticConnection implements SemanticAnalysisConnection {
  readonly id = "local-server-openai";
  readonly name = "OpenAI qua máy chủ cục bộ";
  constructor(
    private readonly transport: typeof fetch = fetch,
    private readonly timeoutMs = 65_000,
  ) {}
  async analyze(input: SemanticAnalysisInput, options?: LessonAnalysisOptions) {
    options?.signal?.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(options?.signal?.reason);
    options?.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.transport("/api/lesson-ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("AI_UNAVAILABLE");
      const result: unknown = await response.json();
      options?.signal?.throwIfAborted();
      return result;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", cancel);
    }
  }
}
export const localAiService = () =>
  new LessonAnalysisService(
    new SemanticLessonAnalysisProvider(new LocalServerSemanticConnection()),
  );
