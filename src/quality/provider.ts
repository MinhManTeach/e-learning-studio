import { z } from "zod";
import type { LessonProject } from "../model/schema";
import { analyzeLessonQuality, type QualityIssue } from "./analyzer";
export const qualityAdviceSchema = z.object({
  issues: z
    .array(
      z.object({
        severity: z.enum(["WARNING", "INFO"]),
        slideId: z.string().nullable(),
        issueCode: z.string().min(1).max(100),
        explanation: z.string().min(1).max(2000),
        suggestedAction: z.string().min(1).max(2000),
      }),
    )
    .max(80),
});
export interface LessonEnhancementProvider {
  review(
    project: LessonProject,
    signal?: AbortSignal,
  ): Promise<{
    mode: "AI" | "DETERMINISTIC";
    status: string;
    issues: QualityIssue[];
  }>;
}
export class OptionalAiEnhancementProvider implements LessonEnhancementProvider {
  constructor(private request: typeof fetch = (...args) => fetch(...args)) {}
  async review(project: LessonProject, signal?: AbortSignal) {
    const fallback = (status: string) => ({
      mode: "DETERMINISTIC" as const,
      status,
      issues: analyzeLessonQuality(project).issues,
    });
    try {
      const response = await this.request("/api/lesson-ai/status", {
        signal,
        credentials: "same-origin",
      });
      if (!response.ok || !(await response.json()).configured)
        return fallback(
          "AI chưa được cấu hình — dùng kiểm tra theo quy tắc, không có nội dung do AI viết.",
        );
      const result = await this.request("/api/lesson-ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
        signal,
        credentials: "same-origin",
      });
      if (!result.ok) throw new Error("AI_UNAVAILABLE");
      const advice = qualityAdviceSchema.parse(await result.json());
      const ids = new Set(project.slides.map((s) => s.id));
      if (advice.issues.some((i) => i.slideId !== null && !ids.has(i.slideId)))
        throw new Error("AI_INVALID_SLIDE");
      return {
        mode: "AI" as const,
        status:
          "AI đã góp ý; giáo viên cần đối chiếu nguồn. Không tự động viết lại bài.",
        issues: [...analyzeLessonQuality(project).issues, ...advice.issues],
      };
    } catch {
      signal?.throwIfAborted();
      return fallback(
        "AI không khả dụng — dùng kiểm tra theo quy tắc; bài hiện tại được giữ nguyên.",
      );
    }
  }
}
