import { z } from "zod";
import type { LessonProject } from "../model/schema";
import { stages } from "../model/schema";

const text = z.string();
const list = z.array(text);
export const importedDocumentSchema = z.object({
  id: text.min(1),
  sourceType: z.enum(["PASTE", "TXT", "DOCX", "PDF"]),
  fileName: text.optional(),
  rawText: text.min(1),
  importedAt: z.iso.datetime(),
});
export type ImportedLessonDocument = z.infer<typeof importedDocumentSchema>;
export const activitySchema = z.object({
  id: text.min(1),
  title: text,
  stage: z.enum(stages).nullable(),
  content: list,
  estimatedMinutes: z.number().nonnegative().nullable(),
});
export const analysisSchema = z.object({
  version: z.literal("1.0"),
  id: text.min(1),
  sourceDocumentId: text.min(1),
  subject: text,
  curriculumGrade: text,
  targetAudienceGrade: text,
  lessonTitle: text,
  topic: text,
  durationMinutes: z.number().nonnegative().nullable(),
  curriculum: text,
  learningOutcomes: list,
  knowledgeObjectives: list,
  competencies: list,
  qualities: list,
  digitalCompetencyIntegration: list,
  aiIntegration: list,
  specialNeedsSupport: list,
  teachingActivities: z.array(activitySchema),
  keyKnowledge: list,
  assessmentEvidence: list,
  safetyTopics: list,
  sourceWarnings: list,
  unmappedContent: list,
  sourceTraces: z.array(
    z.object({
      field: text,
      sourceText: text,
      lineStart: z.number().int().positive(),
      lineEnd: z.number().int().positive(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  teacherEditedFields: list,
});
export type PedagogicalAnalysis = z.infer<typeof analysisSchema>;
export type TeachingActivity = z.infer<typeof activitySchema>;
export interface AnalysisProgress {
  index: number;
  label: string;
  completed: boolean;
}
export interface LessonAnalysisProvider {
  analyze(
    document: ImportedLessonDocument,
    onProgress?: (progress: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<PedagogicalAnalysis>;
}
// Boundary only. No vendor SDK, key, request, or artificial AI implementation.
export interface AiLessonAnalysisProvider extends LessonAnalysisProvider {
  readonly kind: "AI";
}

export const blueprintSlideSchema = z.object({
  id: text.min(1),
  type: z.enum([
    "welcome",
    "objectives",
    "content",
    "warmup",
    "scenario",
    "quiz",
    "summary",
    "completion",
  ]),
  pedagogicalPurpose: text,
  title: text,
  learningGoal: text,
  suggestedContent: list,
  suggestedInteraction: text,
  mediaIntent: z.object({
    type: z.enum(["NONE", "IMAGE", "AUDIO", "VIDEO"]),
    purpose: text,
    searchQuery: text,
    required: z.boolean(),
  }),
  estimatedMinutes: z.number().nonnegative(),
});
export const blueprintSchema = z
  .object({
    version: z.literal("1.0"),
    sourceAnalysisId: text.min(1),
    title: text,
    estimatedDurationMinutes: z.number().nonnegative().nullable(),
    stages: z.array(
      z.object({ stage: z.enum(stages), purpose: text, slideIds: list }),
    ),
    proposedSlides: z.array(blueprintSlideSchema),
    warnings: list,
  })
  .superRefine((b, ctx) => {
    const ids = new Set(b.proposedSlides.map((s) => s.id));
    if (ids.size !== b.proposedSlides.length)
      ctx.addIssue({ code: "custom", message: "Duplicate proposed slide IDs" });
    if (b.stages.some((s) => s.slideIds.some((id) => !ids.has(id))))
      ctx.addIssue({
        code: "custom",
        message: "Unknown proposed slide reference",
      });
  });
export type LessonBlueprint = z.infer<typeof blueprintSchema>;
export interface LessonGenerationProvider {
  createBlueprint(analysis: PedagogicalAnalysis): Promise<LessonBlueprint>;
  generateLesson(blueprint: LessonBlueprint): Promise<LessonProject>;
}

export function serializeAnalysis(analysis: PedagogicalAnalysis) {
  return JSON.stringify(analysisSchema.parse(analysis), null, 2);
}
export function deserializeAnalysis(value: string) {
  return analysisSchema.parse(JSON.parse(value));
}
