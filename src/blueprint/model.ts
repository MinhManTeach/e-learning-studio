import { z } from "zod";
import { stages } from "../model/schema";
import type { PedagogicalAnalysis } from "../import/model";

export const slideTypes = [
  "WELCOME",
  "OBJECTIVES",
  "CONTENT",
  "WARMUP",
  "SCENARIO",
  "QUIZ",
  "SUMMARY",
  "COMPLETION",
] as const;
export const interactionTypes = [
  "NONE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SCENARIO",
  "SHORT_PRACTICE",
] as const;
export const mediaTypes = [
  "NONE",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "ILLUSTRATION",
] as const;
export const slideTypeLabels: Record<(typeof slideTypes)[number], string> = {
  WELCOME: "Mở đầu",
  OBJECTIVES: "Mục tiêu",
  CONTENT: "Nội dung",
  WARMUP: "Khởi động",
  SCENARIO: "Tình huống",
  QUIZ: "Đánh giá",
  SUMMARY: "Tổng kết",
  COMPLETION: "Hoàn thành",
};
const text = z.string();
const ids = z.array(text.min(1));
export const warningSchema = z.object({
  code: text,
  severity: z.enum(["ERROR", "WARNING", "INFO"]),
  message: text,
  slideId: text.optional(),
});
export type BlueprintWarning = z.infer<typeof warningSchema>;
export const blueprintSlideSchema = z.object({
  id: text.min(1),
  order: z.number().int().positive(),
  type: z.enum(slideTypes),
  stage: z.enum(stages),
  title: text,
  pedagogicalPurpose: text,
  learningGoal: text.optional(),
  contentOutline: z.array(text),
  interactionIntent: z
    .object({ type: z.enum(interactionTypes), description: text })
    .optional(),
  mediaIntent: z
    .object({
      type: z.enum(mediaTypes),
      purpose: text,
      searchQuery: text.optional(),
      visualDescription: text.optional(),
      required: z.boolean(),
    })
    .optional(),
  narrationIntent: z
    .object({ enabled: z.boolean(), purpose: text.optional() })
    .optional(),
  estimatedMinutes: z.number().positive(),
  sourceOutcomeIds: ids,
});
export type BlueprintSlide = z.infer<typeof blueprintSlideSchema>;
export const stageSchema = z.object({
  stage: z.enum(stages),
  purpose: text,
  slideIds: ids,
});
export type BlueprintStage = z.infer<typeof stageSchema>;
export const assessmentPlanSchema = z.object({
  assessmentNeeded: z.boolean(),
  targetQuestionCount: z.number().int().nonnegative(),
  targetPassingScore: z.number().min(0).max(100),
  coverage: z.array(
    z.object({
      outcomeId: text,
      slideIds: ids,
      level: z.enum(["RECOGNITION", "UNDERSTANDING", "APPLICATION"]),
    }),
  ),
  recommendedQuestionTypes: z.array(
    z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_PRACTICE"]),
  ),
  rationale: text,
});
export type AssessmentPlan = z.infer<typeof assessmentPlanSchema>;
export const mediaPlanSchema = z.object({
  requiredSlideIds: ids,
  rationale: text,
});
export type MediaPlan = z.infer<typeof mediaPlanSchema>;
export const accessibilityPlanSchema = z.object({
  sourceSupport: z.array(text),
  strategies: z.array(text),
});
export type AccessibilityPlan = z.infer<typeof accessibilityPlanSchema>;
export const lessonBlueprintSchema = z.object({
  version: z.literal("1.0"),
  id: text.min(1),
  sourceAnalysisId: text.min(1),
  title: text,
  subject: text.optional(),
  curriculumGrade: z.number().int().positive().optional(),
  targetAudienceGrade: z.number().int().positive().optional(),
  estimatedDurationMinutes: z.number().positive(),
  durationSource: z.enum(["SOURCE", "PROPOSED"]),
  designRationale: text,
  stages: z.array(stageSchema),
  proposedSlides: z.array(blueprintSlideSchema),
  assessmentPlan: assessmentPlanSchema,
  mediaPlan: mediaPlanSchema,
  accessibilityPlan: accessibilityPlanSchema,
  warnings: z.array(warningSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LessonBlueprint = z.infer<typeof lessonBlueprintSchema>;
export interface LessonBlueprintProvider {
  generate(analysis: PedagogicalAnalysis): Promise<LessonBlueprint>;
}
export interface BlueprintSettings {
  passingScore?: number;
}

// Analysis 1.0 stores outcomes as strings. IDs retain the original field/index in the
// confirmed snapshot; blueprint edits never mutate or re-index that snapshot.
export function outcomeCatalog(a: PedagogicalAnalysis) {
  const field = a.learningOutcomes.some((x) => x.trim())
    ? "learningOutcomes"
    : "knowledgeObjectives";
  return a[field]
    .map((text, i) => ({ id: `${a.id}:${field}:${i + 1}`, text }))
    .filter((o) => o.text.trim());
}
export function outcomeLevel(
  text: string,
): AssessmentPlan["coverage"][number]["level"] {
  return /vận dụng|thực hiện|sử dụng|giải quyết|xử lý/i.test(text)
    ? "APPLICATION"
    : /giải thích|so sánh|phân biệt|hiểu/i.test(text)
      ? "UNDERSTANDING"
      : "RECOGNITION";
}
