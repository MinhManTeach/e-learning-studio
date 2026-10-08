import { z } from "zod";
import type { LessonProject } from "../model/schema";
import { stages } from "../model/schema";

const text = z.string();
const list = z.array(text);
export const documentBlockSchema = z.object({
  id: text.min(1),
  type: z.enum(["HEADING", "PARAGRAPH", "LIST", "TABLE"]),
  text: text.optional(),
  level: z.number().int().positive().optional(),
  numbering: text.optional(),
  items: list.optional(),
  table: z
    .object({
      rows: z.array(
        z.object({
          cells: z.array(
            z.object({
              text,
              colspan: z.number().int().positive().optional(),
              rowspan: z.number().int().positive().optional(),
              column: z.number().int().nonnegative().optional(),
              paragraphs: list.optional(),
              complex: z.boolean().optional(),
            }),
          ),
        }),
      ),
    })
    .optional(),
  sourceOrder: z.number().int().nonnegative(),
});
export type LessonDocumentBlock = z.infer<typeof documentBlockSchema>;
export const semanticCategories = [
  "LESSON_IDENTITY",
  "LEARNING_OUTCOME",
  "KNOWLEDGE",
  "COMPETENCY",
  "QUALITY",
  "PREPARATION",
  "TEACHING_ACTIVITY",
  "WARMUP",
  "DISCOVERY",
  "PRACTICE",
  "ASSESSMENT",
  "APPLICATION",
  "DIGITAL_COMPETENCY",
  "AI_INTEGRATION",
  "SPECIAL_NEEDS",
  "TEACHER_ACTIVITY",
  "STUDENT_ACTIVITY",
  "OTHER",
] as const;
export const classificationSchema = z.object({
  id: text,
  blockId: text,
  sourceText: text,
  category: z.enum(semanticCategories),
  field: text,
  confidence: z.number().min(0).max(1),
  signals: list,
  isHeading: z.boolean(),
  needsReview: z.boolean(),
  corrected: z.boolean().default(false),
  row: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
});
export type BlockClassification = z.infer<typeof classificationSchema>;
export const importedDocumentSchema = z.object({
  id: text.min(1),
  sourceType: z.enum(["PASTE", "TXT", "DOCX", "PDF"]),
  fileName: text.optional(),
  rawText: text.min(1),
  importedAt: z.iso.datetime(),
  blocks: z.array(documentBlockSchema).default([]),
  extractionWarnings: list.default([]),
});
export type ImportedLessonDocument = z.infer<typeof importedDocumentSchema>;
export const activitySchema = z.object({
  id: text.min(1),
  title: text,
  stage: z.enum(stages).nullable(),
  content: list,
  estimatedMinutes: z.number().nonnegative().nullable(),
  teacherActivity: list.default([]),
  studentActivity: list.default([]),
  goals: list.default([]),
  products: list.default([]),
  organization: list.default([]),
  specialNeedsSupport: list.optional(),
  subactivities: z
    .array(
      z.object({
        title: text,
        estimatedMinutes: z.number().nonnegative().nullable(),
        blockId: text,
        row: z.number().int().nonnegative().optional(),
        column: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
});
const gradeEvidenceSchema = z.object({
  value: text,
  source: z.enum(["UNKNOWN", "DOCUMENT", "TEACHER", "UNVERIFIED"]),
  sourceText: text,
  confirmed: z.boolean(),
});
export const analysisSchema = z.object({
  version: z.literal("1.0"),
  id: text.min(1),
  sourceDocumentId: text.min(1),
  subject: text,
  curriculumGrade: text,
  targetAudienceGrade: text,
  gradeProvenance: z
    .object({
      curriculumGrade: gradeEvidenceSchema,
      targetAudienceGrade: gradeEvidenceSchema,
    })
    .optional(),
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
      blockId: text.optional(),
      row: z.number().int().nonnegative().optional(),
      column: z.number().int().nonnegative().optional(),
    }),
  ),
  teacherEditedFields: list,
  classifications: z.array(classificationSchema).default([]),
});
export type PedagogicalAnalysis = z.infer<typeof analysisSchema>;
export type TeachingActivity = z.infer<typeof activitySchema>;
export interface AnalysisProgress {
  index: number;
  label: string;
  completed: boolean;
}
export interface LessonAnalysisOptions {
  onProgress?: (progress: AnalysisProgress) => void;
  signal?: AbortSignal;
}
export interface LessonAnalysisProvider {
  readonly id: string;
  readonly name: string;
  analyze(
    document: ImportedLessonDocument,
    options?: LessonAnalysisOptions,
  ): Promise<PedagogicalAnalysis>;
}
// Boundary only. No vendor SDK, key, request, or artificial AI implementation.
export interface AiLessonAnalysisProvider extends LessonAnalysisProvider {
  readonly kind: "AI";
}

/** @deprecated Phase 2A preview contract retained for compatibility tests only.
 * Active blueprint workflows use ../blueprint/model and never this placeholder. */
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
/** @deprecated Use LessonBlueprint from ../blueprint/model. */
export type LegacyLessonBlueprint = z.infer<typeof blueprintSchema>;
export type { LessonBlueprint } from "../blueprint/model";
import type { LessonBlueprint } from "../blueprint/model";
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
