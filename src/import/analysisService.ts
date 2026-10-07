import { DeterministicLessonAnalysisProvider } from "./analyzer";
import {
  analysisSchema,
  type ImportedLessonDocument,
  type LessonAnalysisOptions,
  type LessonAnalysisProvider,
  type PedagogicalAnalysis,
} from "./model";
import {
  buildSemanticAnalysisInput,
  normalizeSemanticAnalysis,
  type SemanticAnalysisInput,
} from "./semantic";

/** Non-secret preferences only; credentials are held by the local server adapter. */
export interface PersonalAiSettings {
  providerId: string | null;
  model: string | null;
  connectionStatus: "NOT_CONNECTED" | "CONNECTED" | "UNAVAILABLE";
}
export const defaultPersonalAiSettings: Readonly<PersonalAiSettings> =
  Object.freeze({
    providerId: null,
    model: null,
    connectionStatus: "NOT_CONNECTED",
  });
export interface SemanticAnalysisConnection {
  readonly id: string;
  readonly name: string;
  readonly developmentOnly?: boolean;
  analyze(
    input: SemanticAnalysisInput,
    options?: LessonAnalysisOptions,
  ): Promise<unknown>;
}
/** Vendor adapters return unknown: this boundary validates before normalization. */
export class SemanticLessonAnalysisProvider implements LessonAnalysisProvider {
  readonly kind = "AI" as const;
  get id() {
    return this.connection.id;
  }
  get name() {
    return this.connection.name;
  }
  constructor(readonly connection: SemanticAnalysisConnection) {}
  async analyze(
    document: ImportedLessonDocument,
    options?: LessonAnalysisOptions | LessonAnalysisOptions["onProgress"],
    signal?: AbortSignal,
  ) {
    const resolved =
      typeof options === "function" ? { onProgress: options, signal } : options;
    resolved?.signal?.throwIfAborted();
    const result = await this.connection.analyze(
      buildSemanticAnalysisInput(document),
      resolved,
    );
    resolved?.signal?.throwIfAborted();
    return normalizeSemanticAnalysis(result, document);
  }
}
export interface AnalysisServiceResult {
  analysis: PedagogicalAnalysis;
  source: "AI" | "LOCAL";
  aiStatus: "NOT_CONNECTED" | "CONNECTED" | "UNAVAILABLE" | "DEVELOPMENT";
  fallbackReason?: "UNAVAILABLE_OR_INVALID" | "NOT_CONNECTED";
}
export class LessonAnalysisService {
  constructor(
    private readonly semantic?: SemanticLessonAnalysisProvider,
    private readonly fallback: LessonAnalysisProvider = new DeterministicLessonAnalysisProvider(),
    private readonly allowDevelopment = import.meta.env.DEV,
  ) {}
  async analyze(
    document: ImportedLessonDocument,
    options?: LessonAnalysisOptions,
  ): Promise<AnalysisServiceResult> {
    options?.signal?.throwIfAborted();
    const usable =
      this.semantic &&
      (!this.semantic.connection.developmentOnly || this.allowDevelopment);
    if (usable) {
      try {
        const analysis = analysisSchema.parse(
          await this.semantic!.analyze(document, options),
        );
        if (analysis.sourceDocumentId !== document.id)
          throw new Error("Mismatched source");
        return {
          analysis,
          source: this.semantic!.connection.developmentOnly ? "LOCAL" : "AI",
          aiStatus: this.semantic!.connection.developmentOnly
            ? "DEVELOPMENT"
            : "CONNECTED",
        };
      } catch {
        // Never log provider error details: they may contain connection secrets.
        options?.signal?.throwIfAborted();
      }
    }
    const analysis = analysisSchema.parse(
      await this.fallback.analyze(document, options),
    );
    options?.signal?.throwIfAborted();
    if (analysis.sourceDocumentId !== document.id)
      throw new Error("Kết quả không khớp tài liệu nguồn.");
    return {
      analysis,
      source: "LOCAL",
      aiStatus: usable ? "UNAVAILABLE" : "NOT_CONNECTED",
      fallbackReason: usable ? "UNAVAILABLE_OR_INVALID" : "NOT_CONNECTED",
    };
  }
}
