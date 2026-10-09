import { z } from "zod";
import { docxSourceSchema, sourceContextSchema } from "../import/mediaModel";
import {
  metadataSchema as metadata21,
  objectivesSchema as objectives21,
  settingsSchema as settings21,
} from "./schemaV21";
const text = z.string().default("");
const lines = z.array(z.string()).default([]);
const integration = z.object({ code: text, title: text, description: text });
export const stages = [
  "OPENING",
  "DISCOVERY",
  "PRACTICE",
  "ASSESSMENT",
  "APPLICATION",
] as const;
export const layouts = [
  "TEXT_ONLY",
  "TEXT_LEFT_MEDIA_RIGHT",
  "MEDIA_LEFT_TEXT_RIGHT",
  "MEDIA_FULL",
  "CENTERED",
  "MEDIA_COVER",
] as const;
export const themes = ["SAFE_TEAL", "NAVY", "FOCUS_DARK"] as const;
export const metadataSchema = metadata21.extend({
  curriculumGrade: text,
  targetAudienceGrade: text,
});
export const objectivesSchema = objectives21.extend({
  curriculumOutcomes: lines,
  digitalCompetencyIntegration: z.array(integration).default([]),
});
export const settingsSchema = settings21.extend({
  theme: z.enum(themes).default("SAFE_TEAL"),
});
export const assetSchema = z.object({
  docxSource: docxSourceSchema.optional(),
  id: z.string().min(1),
  kind: z.enum(["IMAGE", "AUDIO", "VIDEO"]),
  sourceType: z.enum(["UPLOAD", "URL", "LIBRARY", "GENERATED"]),
  name: text,
  fileName: text,
  mimeType: text,
  size: z.number().nonnegative().optional(),
  url: text,
  altText: text,
  status: z.enum(["EXTERNAL", "LOCAL", "BUNDLED"]).default("EXTERNAL"),
});
export const commonSlideFields = {
  sourceContext: z.array(sourceContextSchema).optional(),
  id: z.string().min(1),
  title: z.string().default("Trang chưa đặt tên"),
  subtitle: text,
  stepNumber: z.number().int().nonnegative().default(1),
  stepName: text,
  pedagogicalStage: z.enum(stages).optional(),
  estimatedMinutes: z.number().nonnegative().optional(),
  layout: z.enum(layouts).default("TEXT_ONLY"),
  voiceScript: text,
  teacherNotes: text,
  narration: z
    .object({
      mode: z
        .enum(["NONE", "BROWSER_TTS", "AUDIO_ASSET"])
        .default("BROWSER_TTS"),
      text: text,
      assetId: z.string().nullable().optional(),
      lang: z.string().default("vi-VN"),
    })
    .prefault({}),
  media: z
    .object({
      enabled: z.boolean().default(false),
      assetId: z.string().nullable().optional(),
      suggestion: text,
      caption: text,
    })
    .prefault({}),
  accessibility: z
    .object({
      fontScale: z.number().min(1).max(2).default(1),
      highContrast: z.boolean().default(false),
      reducedMotion: z.boolean().default(false),
      transcript: text,
      captions: text,
    })
    .prefault({}),
};
export const basicDataSchema = z.object({
  body: text,
  paragraphs: lines,
  bulletPoints: lines,
  keywords: lines,
  keyTakeaway: text,
});
export const warmupItemSchema = z.object({
  id: z.string().min(1),
  label: text,
  icon: text,
  isValid: z.boolean().default(true),
  feedback: text,
});
export const scenarioChoiceSchema = z.object({
  id: z.string().min(1),
  label: text,
  text: text,
  isRecommended: z.boolean(),
  feedback: text,
  consequence: text,
});
export const levels = ["RECOGNITION", "UNDERSTANDING", "APPLICATION"] as const;
export const questionSchema = z
  .object({
    id: z.string().min(1),
    level: z.enum(levels),
    prompt: text,
    options: z
      .array(z.object({ id: z.string().min(1), text: text }))
      .min(2)
      .max(6),
    correctAnswerIndex: z.number().int().nonnegative(),
    explanation: text,
    points: z.number().nonnegative(),
  })
  .superRefine((q, c) => {
    if (q.correctAnswerIndex >= q.options.length)
      c.addIssue({
        code: "custom",
        message: "Đáp án đúng nằm ngoài danh sách lựa chọn.",
      });
    if (new Set(q.options.map((o) => o.id)).size !== q.options.length)
      c.addIssue({ code: "custom", message: "Mã lựa chọn bị trùng." });
  });
export const quizDataSchema = z
  .object({
    title: text,
    instructions: text,
    passingScore: z.number().min(0).max(100).default(80),
    attemptsAllowed: z.number().int().positive().nullable().default(null),
    shuffleQuestions: z.boolean().default(false),
    shuffleAnswers: z.boolean().default(false),
    showFeedbackAfterSubmit: z.boolean().default(true),
    allowReview: z.boolean().default(true),
    questions: z.array(questionSchema).default([]),
  })
  .superRefine((q, c) => {
    if (new Set(q.questions.map((x) => x.id)).size !== q.questions.length)
      c.addIssue({ code: "custom", message: "Mã câu hỏi bị trùng." });
  });
export const helpChannelSchema = z.object({
  id: z.string().min(1),
  label: text,
  value: text,
  description: text,
  enabled: z.boolean().default(true),
});
export const slideSchemas = {
  welcome: z.object({
    ...commonSlideFields,
    type: z.literal("welcome"),
    data: basicDataSchema,
  }),
  content: z.object({
    ...commonSlideFields,
    type: z.literal("content"),
    data: basicDataSchema,
  }),
  objectives: z.object({
    ...commonSlideFields,
    type: z.literal("objectives"),
    data: z.object({
      learningOutcomes: lines,
      keyMessages: lines,
      icons: lines,
    }),
  }),
  warmup: z.object({
    ...commonSlideFields,
    type: z.literal("warmup"),
    data: z
      .object({
        scored: z.boolean().default(false),
        question: text,
        instruction: text,
        items: z.array(warmupItemSchema).default([]),
      })
      .superRefine((v, c) => {
        if (new Set(v.items.map((i) => i.id)).size !== v.items.length)
          c.addIssue({ code: "custom", message: "Mã mục khởi động bị trùng." });
      }),
  }),
  scenario: z.object({
    ...commonSlideFields,
    type: z.literal("scenario"),
    data: z
      .object({
        character: text,
        context: text,
        situation: text,
        question: text,
        choices: z.array(scenarioChoiceSchema).min(2).max(4),
        allowRetry: z.boolean().default(true),
      })
      .superRefine((v, c) => {
        if (!v.choices.some((x) => x.isRecommended))
          c.addIssue({
            code: "custom",
            message: "Cần ít nhất một cách xử lý được khuyến nghị.",
          });
        if (new Set(v.choices.map((i) => i.id)).size !== v.choices.length)
          c.addIssue({ code: "custom", message: "Mã phương án bị trùng." });
      }),
  }),
  quiz: z.object({
    ...commonSlideFields,
    type: z.literal("quiz"),
    data: quizDataSchema,
  }),
  summary: z.object({
    ...commonSlideFields,
    type: z.literal("summary"),
    data: z.object({
      keyMessages: lines,
      mindMapNodes: z
        .array(
          z.object({ id: z.string().min(1), label: text, description: text }),
        )
        .default([]),
      safetyTips: lines,
      helpChannels: z.array(helpChannelSchema).default([]),
    }),
  }),
  completion: z.object({
    ...commonSlideFields,
    type: z.literal("completion"),
    data: z.object({
      message: text,
      reviewLabel: z.string().default("Ôn lại bài"),
      retryLabel: z.string().default("Làm lại bài kiểm tra"),
    }),
  }),
  legacy: z.object({
    ...commonSlideFields,
    type: z.literal("legacy"),
    data: z.object({
      originalType: z.string(),
      original: z.record(z.string(), z.unknown()),
    }),
  }),
};
export const slideSchema = z.discriminatedUnion("type", [
  slideSchemas.welcome,
  slideSchemas.content,
  slideSchemas.objectives,
  slideSchemas.warmup,
  slideSchemas.scenario,
  slideSchemas.quiz,
  slideSchemas.summary,
  slideSchemas.completion,
  slideSchemas.legacy,
]);
export const projectSchema = z
  .object({
    schemaVersion: z.literal("2.2"),
    projectId: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    metadata: metadataSchema,
    objectives: objectivesSchema.prefault({}),
    settings: settingsSchema.prefault({}),
    pedagogy: z
      .object({
        model: z.literal("STUDIO").default("STUDIO"),
        stages: z.array(z.enum(stages)).default([...stages]),
      })
      .prefault({}),
    slides: z.array(slideSchema),
    assets: z.array(assetSchema).default([]),
    legacySource: z.record(z.string(), z.unknown()).optional(),
    migrationSource: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((p, c) => {
    for (const key of ["slides", "assets"] as const)
      if (new Set(p[key].map((x) => x.id)).size !== p[key].length)
        c.addIssue({
          code: "custom",
          message: "Mã định danh bị trùng.",
          path: [key],
        });
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    p.slides.forEach((s, i) => {
      if (s.media.enabled && s.media.assetId && !assets.has(s.media.assetId))
        c.addIssue({
          code: "custom",
          message: "Không tìm thấy hình ảnh được tham chiếu.",
          path: ["slides", i, "media"],
        });
    });
  });
export type LessonProject = z.infer<typeof projectSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type Objectives = z.infer<typeof objectivesSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type SlideType = Exclude<Slide["type"], "legacy">;
export type BasicSlide = Extract<Slide, { type: "welcome" | "content" }>;
export type BasicData = z.infer<typeof basicDataSchema>;
export type AssetReference = z.infer<typeof assetSchema>;
export type QuizData = z.infer<typeof quizDataSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Stage = (typeof stages)[number];
export type Layout = (typeof layouts)[number];
export function parseProject(value: unknown): LessonProject {
  return projectSchema.parse(value);
}
