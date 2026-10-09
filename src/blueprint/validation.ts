import type { PedagogicalAnalysis } from "../import/model";
import { stageLabels } from "../model/analysis";
import { density } from "./design";
import { sourceQuestion } from "../generation/sourceQuestions";
import {
  lessonBlueprintSchema,
  outcomeCatalog,
  outcomeLevel,
  type LessonBlueprint,
  type BlueprintWarning,
} from "./model";

// Derived indexes are rebuilt after every edit. Current slide decisions are authoritative.
export function refreshPlans(b: LessonBlueprint): LessonBlueprint {
  const slides = b.proposedSlides.map((s, i) => ({ ...s, order: i + 1 }));
  const assessment = slides.filter(
    (s) =>
      s.type === "QUIZ" ||
      ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
        s.interactionIntent?.type ?? "",
      ),
  );
  return {
    ...b,
    proposedSlides: slides,
    ...(b.activityPlan
      ? {
          activityPlan: b.activityPlan.map((t) => ({
            ...t,
            slideIds: slides
              .filter((s) => s.sourceActivityIds?.includes(t.activity.id))
              .map((s) => s.id),
          })),
        }
      : {}),
    stages: Object.entries(stageLabels).flatMap(([stage, purpose]) => {
      const slideIds = slides.filter((s) => s.stage === stage).map((s) => s.id);
      return slideIds.length
        ? [
            {
              stage: stage as (typeof slides)[number]["stage"],
              purpose,
              slideIds,
            },
          ]
        : [];
    }),
    mediaPlan: {
      ...b.mediaPlan,
      requiredSlideIds: slides
        .filter((s) => s.mediaIntent?.required && s.mediaIntent.type !== "NONE")
        .map((s) => s.id),
    },
    assessmentPlan: {
      ...b.assessmentPlan,
      assessmentNeeded: assessment.length > 0,
      targetQuestionCount: b.sourceAssessments
        ? assessment.reduce(
            (n, s) => n + (s.sourceAssessmentIds?.length ?? 0),
            0,
          )
        : assessment.length
          ? b.assessmentPlan.targetQuestionCount || 3
          : 0,
      coverage: b.assessmentPlan.coverage.map((c) => ({
        ...c,
        slideIds: assessment
          .filter((s) => s.sourceOutcomeIds.includes(c.outcomeId))
          .map((s) => s.id),
      })),
    },
  };
}
export function validateLessonBlueprint(
  value: unknown,
  analysis: PedagogicalAnalysis,
): BlueprintWarning[] {
  const result = lessonBlueprintSchema.safeParse(value);
  if (!result.success)
    return result.error.issues.map((issue) => ({
      code: "SCHEMA",
      severity: "ERROR",
      message: `${issue.path.join(".")}: ${issue.message}`,
    }));
  const b = result.data;
  const warnings: BlueprintWarning[] = [];
  const add = (
    code: string,
    severity: BlueprintWarning["severity"],
    message: string,
    slideId?: string,
  ) =>
    warnings.push({ code, severity, message, ...(slideId ? { slideId } : {}) });
  const outcomes = outcomeCatalog(analysis);
  const outcomeIds = new Set(outcomes.map((o) => o.id));
  const slides = b.proposedSlides;
  if (b.sourceAnalysisId !== analysis.id)
    add("SOURCE", "ERROR", "Kịch bản không khớp bản phân tích đã xác nhận.");
  if (!b.title.trim()) add("TITLE", "ERROR", "Cần tên bài giảng.");
  if (new Set(slides.map((s) => s.id)).size !== slides.length)
    add("DUPLICATE_ID", "ERROR", "Mã trang bị trùng.");
  if (slides.some((s, i) => s.order !== i + 1))
    add("ORDER", "ERROR", "Thứ tự trang không liên tục.");
  const projected = refreshPlans(b);
  if (JSON.stringify(b.stages) !== JSON.stringify(projected.stages))
    add("STAGES", "ERROR", "Danh sách giai đoạn không khớp các trang.");
  if (
    JSON.stringify(b.mediaPlan.requiredSlideIds) !==
    JSON.stringify(projected.mediaPlan.requiredSlideIds)
  )
    add("MEDIA_PLAN", "ERROR", "Kế hoạch hình minh họa không khớp các trang.");
  for (const s of slides) {
    if (b.sourceAssessments && s.type === "QUIZ") {
      const items = (s.sourceAssessmentIds ?? []).map((id) =>
        b.sourceAssessments!.find((q) => q.id === id),
      );
      if (
        !items.length ||
        items.some((q) => !q || !sourceQuestion(q, "validation"))
      )
        add(
          "SOURCE_ASSESSMENT",
          "ERROR",
          "Trang đánh giá cần câu hỏi nguồn tương thích đã duyệt.",
          s.id,
        );
      if (
        items.some(
          (q) =>
            q &&
            b.periodReview &&
            !b.periodReview.assignedAssessmentIds.includes(q.id) &&
            !(
              q.periodId &&
              b.periodReview.selectedPeriodIds.includes(q.periodId)
            ) &&
            !(
              q.activityId &&
              b.activityPlan?.some((t) => t.activity.id === q.activityId)
            ),
        )
      )
        add(
          "ASSESSMENT_SCOPE",
          "ERROR",
          "Câu hỏi chưa thuộc phần nguồn được chọn hoặc được giáo viên gán riêng.",
          s.id,
        );
    }
    if (
      !s.title.trim() ||
      !s.pedagogicalPurpose.trim() ||
      !s.contentOutline.some((x) => x.trim())
    )
      add(
        "EMPTY_CONTENT",
        "ERROR",
        "Trang cần tiêu đề, mục đích và nội dung đề cương.",
        s.id,
      );
    if (s.sourceOutcomeIds.some((id) => !outcomeIds.has(id)))
      add(
        "UNKNOWN_OUTCOME",
        "ERROR",
        "Trang tham chiếu yêu cầu cần đạt không tồn tại.",
        s.id,
      );
    if (new Set(s.sourceOutcomeIds).size !== s.sourceOutcomeIds.length)
      add(
        "DUPLICATE_REFERENCE",
        "WARNING",
        "Trang lặp mã yêu cầu cần đạt.",
        s.id,
      );
    if (
      density(
        s.contentOutline,
        s.sourceOutcomeIds.length,
        b.targetAudienceGrade,
      ).excessive
    )
      add(
        "DENSITY",
        "WARNING",
        "Trang có nhiều ý hoặc tải đọc cao; nên tách hoặc rút gọn.",
        s.id,
      );
    const m = s.mediaIntent;
    if (
      m &&
      ((m.type === "NONE" && m.required) ||
        (m.type !== "NONE" &&
          (!m.purpose.trim() ||
            !(m.searchQuery?.trim() || m.visualDescription?.trim()))))
    )
      add(
        "MEDIA",
        "ERROR",
        "Nhu cầu học liệu cần mục đích và mô tả hoặc từ khóa cụ thể.",
        s.id,
      );
    if (
      m?.type !== "NONE" &&
      m?.searchQuery &&
      /^(education image|hình ảnh giáo dục)$/i.test(m.searchQuery.trim())
    )
      add(
        "MEDIA_GENERIC",
        "WARNING",
        "Từ khóa hình ảnh cần gắn với khái niệm của trang.",
        s.id,
      );
    if (
      s.interactionIntent &&
      s.interactionIntent.type !== "NONE" &&
      !s.interactionIntent.description.trim()
    )
      add("INTERACTION", "ERROR", "Cần mô tả mục đích tương tác.", s.id);
    if (
      s.type === "QUIZ" &&
      !["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_PRACTICE"].includes(
        s.interactionIntent?.type ?? "",
      )
    )
      add(
        "QUIZ_INTENT",
        "ERROR",
        "Trang đánh giá cần tương tác đánh giá tương thích.",
        s.id,
      );
    if (s.type === "SCENARIO" && s.interactionIntent?.type !== "SCENARIO")
      add(
        "SCENARIO_INTENT",
        "ERROR",
        "Trang tình huống cần tương tác ra quyết định.",
        s.id,
      );
  }
  for (const o of outcomes) {
    const experiences = slides.filter(
      (s) =>
        !["WELCOME", "OBJECTIVES", "SUMMARY", "COMPLETION"].includes(s.type) &&
        s.sourceOutcomeIds.includes(o.id),
    );
    if (!experiences.length)
      add(
        "UNCOVERED_OUTCOME",
        "WARNING",
        `Yêu cầu cần đạt chưa có trang hoạt động: “${shorten(o.text)}”.`,
      );
    if (experiences.length > 4)
      add(
        "EXCESSIVE_COVERAGE",
        "WARNING",
        `Yêu cầu cần đạt được lặp nhiều lần: ${o.text}`,
      );
  }
  const total = slides.reduce((n, s) => n + s.estimatedMinutes, 0);
  if (b.sourceAssessments) {
    const refs = slides
      .filter((s) => s.type === "QUIZ")
      .flatMap((s) => s.sourceAssessmentIds ?? []);
    if (new Set(refs).size !== refs.length)
      add(
        "DUPLICATE_ASSESSMENT",
        "ERROR",
        "Câu hỏi nguồn bị lặp giữa các trang; bỏ bản sao trước khi duyệt.",
      );
  }
  for (const id of b.periodReview?.selectedPeriodIds ?? []) {
    // Teachers see "Tiết N", never the internal period ID.
    const number = analysis.teachingPeriods?.find((p) => p.id === id)?.number;
    const label = number ? `Tiết ${number}` : "tiết đã chọn";
    const minutes = slides
      .filter((s) => s.plannedPeriodId === id)
      .reduce((n, s) => n + s.estimatedMinutes, 0);
    if (Math.abs(minutes - b.periodReview!.minutesPerPeriod) > 1)
      add(
        "PERIOD_TIME",
        "WARNING",
        `Phân bổ trang trong ${label}: ${minutes.toFixed(1)} phút; xác nhận ${b.periodReview!.minutesPerPeriod} phút.`,
      );
  }
  const budget = b.periodReview
    ? b.periodReview.totalDurationMinutes
    : analysis.durationMinutes && analysis.durationMinutes > 0
      ? analysis.durationMinutes
      : b.estimatedDurationMinutes;
  if (Math.abs(total - budget) > Math.max(1, budget * 0.05))
    add(
      "TIME_BUDGET",
      "WARNING",
      `Tổng thời gian ${total.toFixed(1)} phút khác thời lượng ${budget} phút.`,
    );
  if (
    slides[0]?.type !== "WELCOME" ||
    slides.at(-1)?.type !== "COMPLETION" ||
    !slides.some((s) => s.type === "SUMMARY") ||
    !slides.some((s) => s.type === "OBJECTIVES")
  )
    add(
      "COMPLETION_STRUCTURE",
      "ERROR",
      "Cần mở đầu, mục tiêu, tổng kết và hoàn thành ở cuối.",
    );
  if (
    !slides.some(
      (s) => s.interactionIntent && s.interactionIntent.type !== "NONE",
    )
  )
    add(
      "NO_INTERACTION",
      "WARNING",
      "Nên có ít nhất một hoạt động chủ động của học sinh.",
    );
  const plan = b.assessmentPlan;
  const assessment = slides.filter(
    (s) =>
      s.type === "QUIZ" ||
      ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
        s.interactionIntent?.type ?? "",
      ),
  );
  if (
    plan.assessmentNeeded !== assessment.length > 0 ||
    (plan.assessmentNeeded
      ? plan.targetQuestionCount < 1 || !plan.recommendedQuestionTypes.length
      : plan.targetQuestionCount !== 0)
  )
    add(
      "ASSESSMENT",
      "ERROR",
      "Kế hoạch đánh giá không nhất quán với các trang.",
    );
  if (
    new Set(plan.coverage.map((c) => c.outcomeId)).size !==
      plan.coverage.length ||
    plan.coverage.some(
      (c) =>
        !outcomeIds.has(c.outcomeId) ||
        c.slideIds.some(
          (id) =>
            !assessment.some(
              (s) => s.id === id && s.sourceOutcomeIds.includes(c.outcomeId),
            ),
        ),
    )
  )
    add("ASSESSMENT_COVERAGE", "ERROR", "Tham chiếu đánh giá không hợp lệ.");
  if (
    plan.assessmentNeeded &&
    outcomes.some(
      (o) =>
        !plan.coverage.some((c) => c.outcomeId === o.id && c.slideIds.length),
    )
  )
    add(
      "ASSESSMENT_GAP",
      "WARNING",
      "Có yêu cầu cần đạt chưa được phân bổ đánh giá.",
    );
  if (b.durationSource === "PROPOSED")
    add(
      "PROPOSED_DURATION",
      "INFO",
      "Thời lượng đề xuất; kế hoạch nguồn chưa có thời lượng.",
    );
  return warnings;
}
export function initialCoverage(a: PedagogicalAnalysis) {
  return outcomeCatalog(a).map((o) => ({
    outcomeId: o.id,
    slideIds: [] as string[],
    level: outcomeLevel(o.text),
  }));
}
function shorten(text: string, max = 90) {
  const t = text.trim().replace(/^[-•*–]\s*/, "");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}
