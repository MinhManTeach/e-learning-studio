import { projectSchema, type Slide } from "../model/schema";
import type { LessonBlueprint } from "../blueprint/model";
import type { GenerationWarning, LessonGenerationContext } from "./model";

export function instructionalText(s: Slide): string[] {
  switch (s.type) {
    case "welcome":
    case "content":
      return [s.data.body, ...s.data.paragraphs, ...s.data.bulletPoints];
    case "objectives":
      return s.data.learningOutcomes;
    case "warmup":
      return [s.data.question, ...s.data.items.map((i) => i.label)];
    case "scenario":
      return [
        s.data.situation,
        s.data.question,
        ...s.data.choices.map((c) => c.text),
      ];
    case "quiz":
      return s.data.questions.map((q) => q.prompt);
    case "summary":
      return s.data.keyMessages;
    case "cards":
      return [
        s.data.intro,
        ...s.data.items.map((i) =>
          [i.title, i.text].filter(Boolean).join(": "),
        ),
        s.data.keyTakeaway,
      ];
    case "activity":
      return [s.data.instruction, ...s.data.items.map((i) => i.text)];
    case "completion":
      return [s.data.message];
    default:
      return [];
  }
}
export function validateGeneratedLesson(
  value: unknown,
  blueprint: LessonBlueprint,
  context: LessonGenerationContext,
): GenerationWarning[] {
  const parsed = projectSchema.safeParse(value);
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      code: "SCHEMA",
      severity: "ERROR",
      message: `${i.path.join(".")}: ${i.message}`,
    }));
  const p = parsed.data;
  const warnings: GenerationWarning[] = [];
  const add = (
    code: string,
    severity: GenerationWarning["severity"],
    message: string,
  ) => warnings.push({ code, severity, message });
  const ids = new Set(context.outcomes.map((o) => o.id));
  if (
    blueprint.proposedSlides.some((s) =>
      s.sourceOutcomeIds.some((id) => !ids.has(id)),
    ) ||
    blueprint.assessmentPlan.coverage.some((c) => !ids.has(c.outcomeId))
  )
    add(
      "OUTCOME_REFERENCE",
      "ERROR",
      "Tham chiếu yêu cầu cần đạt không hợp lệ.",
    );
  if (
    p.slides.length !== blueprint.proposedSlides.length ||
    p.slides.some(
      (s, i) =>
        s.type !== blueprint.proposedSlides[i].type.toLowerCase() ||
        s.title !== blueprint.proposedSlides[i].title,
    )
  )
    add("MAPPING", "ERROR", "Trang tạo ra chưa khớp kịch bản đã duyệt.");
  if (
    p.projectId !== context.projectId ||
    p.metadata.projectTitle !== blueprint.title ||
    p.settings.passingScore !== blueprint.assessmentPlan.targetPassingScore
  )
    add(
      "IDENTITY",
      "ERROR",
      "Thông tin bài giảng chưa khớp kịch bản đã duyệt.",
    );
  const sourceSlideIds = new Set(blueprint.proposedSlides.map((s) => s.id));
  if (
    blueprint.assessmentPlan.coverage.some((c) =>
      c.slideIds.some((id) => !sourceSlideIds.has(id)),
    )
  )
    add(
      "OUTCOME_REFERENCE",
      "ERROR",
      "Kế hoạch đánh giá tham chiếu trang không còn trong kịch bản.",
    );
  const questions = p.slides.flatMap((s) =>
    s.type === "quiz" ? s.data.questions : [],
  );
  if (new Set(questions.map((q) => q.id)).size !== questions.length)
    add("QUESTION_IDS", "ERROR", "Mã câu hỏi bị trùng giữa các trang.");
  if (questions.length !== blueprint.assessmentPlan.targetQuestionCount)
    add("QUESTION_COUNT", "ERROR", "Số câu hỏi chưa khớp kế hoạch đánh giá.");
  for (const s of p.slides) {
    if (!s.title.trim()) add("TITLE", "ERROR", "Trang chưa có tiêu đề.");
    if (!instructionalText(s).some((t) => t.trim()))
      add("EMPTY_CONTENT", "ERROR", "Trang chưa có nội dung học tập.");
    if (s.type === "legacy")
      add("UNSUPPORTED_TYPE", "ERROR", "Kiểu trang không hỗ trợ tạo bài.");
    if (instructionalText(s).join(" ").split(/\s+/).length > 130)
      add(
        "DENSITY",
        "WARNING",
        `Trang “${s.title}” có tải đọc cao; nên rút gọn.`,
      );
    if (
      instructionalText(s).some((t) =>
        /giáo viên tổ chức|GV yêu cầu|học sinh phải/iu.test(t),
      )
    )
      add(
        "LEARNER_LANGUAGE",
        "WARNING",
        `Trang “${s.title}” cần kiểm tra lại lời văn dành cho học sinh.`,
      );
    if (
      s.type === "warmup" &&
      (!s.data.items.length || s.data.items.some((i) => !i.feedback.trim()))
    )
      add("WARMUP", "ERROR", "Khởi động cần lựa chọn và phản hồi.");
    if (
      s.type === "scenario" &&
      (!s.data.situation.trim() ||
        !s.data.question.trim() ||
        s.data.choices.some(
          (c) => !c.text.trim() || !c.feedback.trim() || !c.consequence.trim(),
        ))
    )
      add(
        "SCENARIO",
        "ERROR",
        "Tình huống cần nội dung, lựa chọn và phản hồi đầy đủ.",
      );
    if (
      s.type === "quiz" &&
      (!s.data.questions.length ||
        s.data.questions.some(
          (q) =>
            !q.prompt.trim() ||
            (!blueprint.sourceAssessments && !q.explanation.trim()) ||
            q.points <= 0 ||
            q.options.some((o) => !o.text.trim()),
        ))
    )
      add(
        "QUIZ",
        "ERROR",
        "Câu hỏi cần đáp án, lời giải thích và trọng số dương.",
      );
    if (
      s.media.enabled &&
      s.media.assetId &&
      !p.assets.find((a) => a.id === s.media.assetId)?.url
    )
      add("BROKEN_MEDIA", "ERROR", "Không bật hiển thị học liệu chưa có tệp.");
  }
  const unresolved = blueprint.proposedSlides.filter(
    (s, i) =>
      s.mediaIntent?.required &&
      !p.assets.find((a) => a.id === p.slides[i]?.media.assetId)?.url,
  ).length;
  if (unresolved)
    add(
      "UNRESOLVED_MEDIA",
      "WARNING",
      `${unresolved} trang cần học liệu minh họa; chưa tìm kiếm hoặc tạo học liệu.`,
    );
  const time = p.slides.reduce((n, s) => n + (s.estimatedMinutes ?? 0), 0);
  if (
    Math.abs(time - p.metadata.durationMinutes) >
    Math.max(1, p.metadata.durationMinutes * 0.05)
  )
    add(
      "DURATION",
      "WARNING",
      "Tổng thời gian các trang khác thời lượng bài học.",
    );
  if (
    p.slides[0]?.type !== "welcome" ||
    p.slides.at(-1)?.type !== "completion" ||
    !p.slides.some((s) => s.type === "summary") ||
    !p.slides.some((s) => s.type === "objectives")
  )
    add(
      "COMPLETION",
      "ERROR",
      "Bài học cần mở đầu, mục tiêu, tổng kết và hoàn thành.",
    );
  return warnings;
}
