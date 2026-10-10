import type { Layout, LessonProject, Slide } from "./schema";
export const stageLabels = {
  OPENING: "Mở đầu & Khởi động",
  DISCOVERY: "Khám phá & Hình thành kiến thức",
  PRACTICE: "Thực hành & Xử lý tình huống",
  ASSESSMENT: "Luyện tập & Đánh giá",
  APPLICATION: "Tổng kết & Vận dụng",
};
export const layoutLabels: Record<Layout, string> = {
  TEXT_ONLY: "Chỉ văn bản",
  TEXT_LEFT_MEDIA_RIGHT: "Chữ trái · Ảnh phải",
  MEDIA_LEFT_TEXT_RIGHT: "Ảnh trái · Chữ phải",
  MEDIA_FULL: "Ảnh toàn trang",
  CENTERED: "Căn giữa",
  MEDIA_COVER: "Ảnh/video phủ kín trang",
};
export interface ConsistencyWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  resolved: boolean;
}
export function consistencyWarnings(p: LessonProject): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  const { curriculumGrade: a, targetAudienceGrade: b } = p.metadata;
  if (a && b && a !== b)
    warnings.push({
      code: "GRADE_MISMATCH",
      severity: "warning",
      message: `Yêu cầu cần đạt thuộc chương trình lớp ${a}, trong khi đối tượng học sinh được khai báo là lớp ${b}.`,
      resolved: false,
    });
  // Completion stays IN_PROGRESS by spec here; warn instead of changing the rule.
  if (p.settings.requireQuiz && !p.slides.some((s) => s.type === "quiz"))
    warnings.push({
      code: "REQUIRE_QUIZ_WITHOUT_QUIZ",
      severity: "warning",
      message:
        "Bài giảng đang yêu cầu hoàn tất trắc nghiệm nhưng chưa có trang trắc nghiệm. Học sinh sẽ không thể hoàn thành bài. Hãy thêm trang trắc nghiệm, hoặc bỏ chọn “Yêu cầu hoàn tất trắc nghiệm” ở Thông tin bài giảng → Giao diện & hoàn thành bài.",
      resolved: false,
    });
  return warnings;
}
export const densityThresholds = {
  title: 90,
  subtitle: 160,
  bullets: 7,
  characters: 1400,
  voice: 1800,
};
export interface DensityWarning {
  code: string;
  message: string;
}
export function analyzeSlideDensity(
  s: Slide,
  thresholds = densityThresholds,
): DensityWarning[] {
  const warnings: DensityWarning[] = [];
  if (s.title.length > thresholds.title)
    warnings.push({ code: "TITLE", message: "Tiêu đề có thể quá dài." });
  if (s.subtitle.length > thresholds.subtitle)
    warnings.push({ code: "SUBTITLE", message: "Phụ đề có thể quá dài." });
  if (
    (s.type === "welcome" || s.type === "content") &&
    s.data.bulletPoints.length > thresholds.bullets
  )
    warnings.push({
      code: "BULLETS",
      message: "Trang có quá nhiều gạch đầu dòng.",
    });
  if (JSON.stringify(s.data).length > thresholds.characters)
    warnings.push({
      code: "CONTENT",
      message: "Nội dung có thể cần cuộn khi trình chiếu.",
    });
  if (s.voiceScript.length > thresholds.voice)
    warnings.push({ code: "VOICE", message: "Lời thuyết minh khá dài." });
  return warnings;
}
export function effectiveLayout(s: Slide, hasImage: boolean): Layout {
  if (!s.media.enabled || !hasImage)
    return s.layout === "CENTERED" ? "CENTERED" : "TEXT_ONLY";
  // A picture covering the page would hide the questions students must answer.
  if (
    s.layout === "MEDIA_COVER" &&
    (s.type === "warmup" ||
      s.type === "scenario" ||
      s.type === "quiz" ||
      s.type === "activity")
  )
    return "MEDIA_FULL";
  return s.layout;
}
