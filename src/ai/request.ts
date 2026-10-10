// What "AI thiết kế bài giảng" sends to the AI about a lesson: page text, notes,
// existing questions and (optionally) page pictures. Shared by server and browser.
import { z } from "zod";
import type { AssetReference, LessonProject, Slide } from "../model/schema";

export type PictureState = "NONE" | "PICTURE" | "COVER" | "VIDEO";
export interface LessonSlideInput {
  id: string;
  type: "content" | "quiz" | "other";
  title: string;
  stage: string;
  text: string[];
  notes: string;
  picture: PictureState;
  /** Index of this page's picture in the images sent with the request. */
  image?: number;
  questions?: {
    id: string;
    prompt: string;
    options: string[];
    correct: number;
    explanation: string;
  }[];
}
export interface LessonImage {
  mimeType: string;
  /** Base64 bytes. */
  data: string;
}
export const lessonRequestSchema = z.object({
  lesson: z.object({
    title: z.string().max(300),
    subject: z.string().max(200),
    grade: z.string().max(50),
  }),
  slides: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        type: z.enum(["content", "quiz", "other"]),
        title: z.string().max(400),
        stage: z.string().max(40),
        text: z.array(z.string().max(2000)).max(60),
        notes: z.string().max(6000),
        picture: z.enum(["NONE", "PICTURE", "COVER", "VIDEO"]),
        image: z.number().int().nonnegative().optional(),
        questions: z
          .array(
            z.object({
              id: z.string().min(1).max(100),
              prompt: z.string().max(1000),
              options: z.array(z.string().max(400)).max(6),
              correct: z.number().int(),
              explanation: z.string().max(1000),
            }),
          )
          .max(20)
          .optional(),
      }),
    )
    .min(1)
    .max(120),
  images: z
    .array(
      z.object({
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        data: z.string().max(3_000_000),
      }),
    )
    .max(40),
});
export type LessonRequest = z.infer<typeof lessonRequestSchema>;

const stageLabel: Record<string, string> = {
  OPENING: "Mở đầu",
  DISCOVERY: "Khám phá",
  PRACTICE: "Thực hành",
  ASSESSMENT: "Luyện tập",
  APPLICATION: "Vận dụng",
};
export function pictureState(
  project: LessonProject,
  slide: Slide,
): PictureState {
  const asset =
    slide.media.enabled && slide.media.assetId
      ? project.assets.find((a) => a.id === slide.media.assetId)
      : undefined;
  if (!asset) return "NONE";
  if (asset.kind === "VIDEO") return "VIDEO";
  return slide.layout === "MEDIA_COVER" ? "COVER" : "PICTURE";
}
function slideText(slide: Slide) {
  if (slide.type === "content" || slide.type === "welcome")
    return [
      ...slide.data.paragraphs,
      ...slide.data.bulletPoints,
      ...(slide.data.body ? [slide.data.body] : []),
    ];
  if (slide.type === "summary") return slide.data.keyMessages;
  if (slide.type === "objectives") return slide.data.learningOutcomes;
  return [];
}

/** Pictures worth showing the AI: page pictures it should describe or name the page from. */
export function pictureAssets(project: LessonProject) {
  const out: { slideId: string; asset: AssetReference }[] = [];
  for (const s of project.slides) {
    if (s.type !== "content" || !s.media.enabled || !s.media.assetId) continue;
    const asset = project.assets.find((a) => a.id === s.media.assetId);
    if (asset?.kind === "IMAGE" && asset.status === "LOCAL")
      out.push({ slideId: s.id, asset });
  }
  return out;
}

export function lessonRequest(
  project: LessonProject,
  images: Map<string, LessonImage> = new Map(),
): LessonRequest {
  const sent: LessonImage[] = [];
  return {
    lesson: {
      title: project.metadata.projectTitle,
      subject: project.metadata.subject,
      grade: project.metadata.grade,
    },
    slides: project.slides
      .filter((s) => s.type !== "completion")
      .map((s) => {
        const picture = pictureState(project, s);
        const image = images.get(s.id);
        const index = image && sent.length < 40 ? sent.push(image) - 1 : -1;
        return {
          id: s.id,
          type:
            s.type === "content"
              ? "content"
              : s.type === "quiz"
                ? "quiz"
                : "other",
          title: s.title,
          stage: stageLabel[s.pedagogicalStage ?? ""] ?? "",
          text: slideText(s),
          notes: s.teacherNotes,
          picture,
          ...(index >= 0 ? { image: index } : {}),
          ...(s.type === "quiz"
            ? {
                questions: s.data.questions.map((q) => ({
                  id: q.id,
                  prompt: q.prompt,
                  options: q.options.map((o) => o.text),
                  correct: q.correctAnswerIndex,
                  explanation: q.explanation,
                })),
              }
            : {}),
        };
      }),
    images: sent.map((i) => ({
      mimeType: i.mimeType as LessonRequest["images"][number]["mimeType"],
      data: i.data,
    })),
  };
}
