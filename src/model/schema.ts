import { z } from "zod";

const text = z.string().default("");
const lines = z.array(z.string()).default([]);
export const metadataSchema = z.object({
  projectTitle: z.string().default("Bài giảng mới"),
  subject: text,
  grade: text,
  topic: text,
  durationMinutes: z.number().int().nonnegative().default(35),
  teacherName: text,
  schoolName: text,
  curriculum: text,
});
export const objectivesSchema = z.object({
  knowledge: lines,
  competencies: lines,
  qualities: lines,
  aiIntegration: z
    .object({ code: text, title: text, description: text })
    .default({ code: "", title: "", description: "" }),
  specialNeeds: text,
});
export const settingsSchema = z.object({
  aspectRatio: z.literal("16:9").default("16:9"),
  theme: z.literal("SAFE_TEAL").default("SAFE_TEAL"),
  passingScore: z.number().min(0).max(100).default(80),
  requireAllSlides: z.boolean().default(true),
  requireQuiz: z.boolean().default(true),
  allowRetry: z.boolean().default(true),
});
const common = {
  id: z.string().min(1),
  stepNumber: z.number().int().nonnegative().default(1),
  stepName: text,
  title: z.string().default("Trang chưa đặt tên"),
  subtitle: text,
  voiceScript: text,
  notes: text,
};
export const basicDataSchema = z.object({
  body: text,
  bulletPoints: lines,
  keyTakeaway: text,
  imageUrl: text,
  imageCaption: text,
});
export const slideSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("welcome"), data: basicDataSchema }),
  z.object({ ...common, type: z.literal("content"), data: basicDataSchema }),
  z.object({
    ...common,
    type: z.literal("legacy"),
    data: z.object({
      originalType: z.string(),
      original: z.record(z.string(), z.unknown()),
    }),
  }),
]);
export const projectSchema = z
  .object({
    schemaVersion: z.literal("2.1"),
    projectId: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    metadata: metadataSchema,
    objectives: objectivesSchema.prefault({}),
    settings: settingsSchema.prefault({}),
    slides: z.array(slideSchema),
    assets: z
      .array(z.object({ id: z.string(), url: z.string(), name: text }))
      .default([]),
    legacySource: z.record(z.string(), z.unknown()).optional(),
    migrationSource: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.slides.map((s) => s.id)).size !== p.slides.length)
      ctx.addIssue({
        code: "custom",
        message: "Mã trang bị trùng.",
        path: ["slides"],
      });
    if (new Set(p.assets.map((a) => a.id)).size !== p.assets.length)
      ctx.addIssue({
        code: "custom",
        message: "Mã tài nguyên bị trùng.",
        path: ["assets"],
      });
  });
export type LessonProject = z.infer<typeof projectSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type Objectives = z.infer<typeof objectivesSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type BasicSlide = Extract<Slide, { type: "welcome" | "content" }>;
export type BasicData = z.infer<typeof basicDataSchema>;
export type SlideType = BasicSlide["type"];
export function parseProject(value: unknown): LessonProject {
  return projectSchema.parse(value);
}
