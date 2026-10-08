import type { LessonBlueprint } from "../blueprint/model";
import type { LessonProject } from "../model/schema";

export interface LessonGenerationContext {
  projectId: string;
  now: string;
  outcomes: { id: string; text: string }[];
  prepareProject?: (
    project: LessonProject,
  ) => Promise<{ project: LessonProject; rollback: () => Promise<void> }>;
  onProgress?: (stage: number) => void;
}
export interface LessonGenerationProvider {
  generate(
    blueprint: LessonBlueprint,
    context: LessonGenerationContext,
  ): Promise<LessonProject>;
}
// Boundary only; no vendor transport or automatic AI connection.
export interface AiLessonGenerationProvider extends LessonGenerationProvider {
  readonly kind: "AI";
}
export const generationSteps = [
  "Đang xây dựng cấu trúc bài…",
  "Đang tạo nội dung các trang…",
  "Đang tạo hoạt động tương tác…",
  "Đang xây dựng câu hỏi đánh giá…",
  "Đang chuẩn bị lời thuyết minh…",
  "Đang kiểm tra bài giảng…",
] as const;
export interface GenerationWarning {
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
}
export interface GenerationResult {
  project: LessonProject;
  warnings: GenerationWarning[];
}
