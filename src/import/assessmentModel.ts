import { z } from "zod";
export const assessmentTypes = [
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "MATCHING",
  "ORDERING",
  "SHORT_ANSWER",
  "OBSERVATION",
  "PERFORMANCE",
] as const;
export const assessmentSourceSchema = z.object({
  blockId: z.string(),
  sourceText: z.string(),
  originalSourceText: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  tableIndex: z.number().int().nonnegative().optional(),
  row: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  paragraph: z.number().int().nonnegative(),
  activityId: z.string().optional(),
  periodId: z.string().optional(),
  role: z.enum(["TEACHER", "STUDENT", "UNKNOWN"]),
});
const candidateSchema = z.object({
  text: z.string(),
  value: z.string(),
  source: assessmentSourceSchema,
  status: z.enum([
    "SOURCE_VERIFIED",
    "NEEDS_TEACHER_REVIEW",
    "TEACHER_CONFIRMED",
  ]),
});
export const assessmentSchema = z.object({
  id: z.string(),
  type: z.enum(assessmentTypes),
  prompt: z.string(),
  number: z.string().optional(),
  rubricLevels: z
    .array(z.object({ label: z.string(), text: z.string() }))
    .default([]),
  choices: z.array(z.object({ label: z.string(), text: z.string() })),
  answer: candidateSchema.nullable(),
  answerCandidates: z.array(candidateSchema),
  feedback: z.string(),
  sources: z.array(assessmentSourceSchema),
  activityId: z.string().optional(),
  periodId: z.string().optional(),
  context: z.enum(["ACTIVITY", "WORKSHEET", "RUBRIC", "DOCUMENT"]),
  confidence: z.number().min(0).max(1),
  reviewStatus: z.enum(["NEEDS_TEACHER_REVIEW", "READY", "EXCLUDED"]),
  duplicateCount: z.number().int().nonnegative(),
  teacherEdited: z.boolean(),
});
export type Assessment = z.infer<typeof assessmentSchema>;
export type AssessmentSource = z.infer<typeof assessmentSourceSchema>;
