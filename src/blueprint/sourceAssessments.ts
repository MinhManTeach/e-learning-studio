import type { PedagogicalAnalysis } from "../import/model";
import { sourceQuestion } from "../generation/sourceQuestions";
import { allocatePeriodTime } from "./periodTime";
import type {
  LessonBlueprint,
  BlueprintSlide,
  BlueprintWarning,
} from "./model";
import { refreshPlans, validateLessonBlueprint } from "./validation";

export function integrateSourceAssessments(
  a: PedagogicalAnalysis,
  b: LessonBlueprint,
): LessonBlueprint {
  if (!a.assessments?.length && !b.periodReview) return b;
  const warnings: BlueprintWarning[] = [];
  const selected = new Set(
    b.activityPlan?.map((t) => t.activity.id) ??
      a.teachingActivities.map((t) => t.id),
  );
  const eligible = (a.assessments ?? []).filter((q) => {
    if (q.reviewStatus !== "READY") return false;
    if (!sourceQuestion(q, "check")) {
      warnings.push({
        code: "ASSESSMENT_UNSUPPORTED",
        severity: "WARNING",
        message: `${q.prompt}: kiểu câu hỏi hoặc đáp án chưa tương thích; giữ để giáo viên duyệt.`,
      });
      return false;
    }
    return a.teachingPeriods?.length && !b.periodReview
      ? false
      : b.periodReview
        ? b.periodReview.assignedAssessmentIds.includes(q.id) ||
          (q.periodId
            ? b.periodReview.selectedPeriodIds.includes(q.periodId)
            : !!q.activityId && selected.has(q.activityId))
        : true;
  });
  const slides = b.proposedSlides.filter((s) => s.type !== "QUIZ");
  for (const s of slides)
    if (
      ["MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
        s.interactionIntent?.type ?? "",
      )
    )
      s.interactionIntent = {
        type: "SHORT_PRACTICE",
        description: "Thực hiện và trao đổi cùng giáo viên; chưa chấm điểm.",
      };
  for (const q of eligible) {
    const slide: BlueprintSlide = {
      id: `${a.id}:assessment-slide:${q.id}`,
      order: 1,
      type: "QUIZ",
      stage: "ASSESSMENT",
      title: "Em kiểm tra điều đã học",
      pedagogicalPurpose: "Thực hiện câu hỏi nguồn đã được giáo viên xác nhận.",
      contentOutline: [q.prompt],
      sourceOutcomeIds: [],
      estimatedMinutes: 1,
      sourceAssessmentIds: [q.id],
      sourcePeriodId: q.periodId,
      sourceActivityIds: q.activityId ? [q.activityId] : [],
      sourceContext: q.sources.map((s) => ({
        blockId: s.blockId,
        row: s.row,
        column: s.column,
        activityId: s.activityId,
      })),
      interactionIntent: {
        type: q.type as "MULTIPLE_CHOICE" | "TRUE_FALSE",
        description: "Chọn đáp án; xem kết quả sau khi nộp bài.",
      },
      mediaIntent: { type: "NONE", purpose: "", required: false },
    };
    const last =
      slides
        .map((s, i) =>
          q.activityId && s.sourceActivityIds?.includes(q.activityId) ? i : -1,
        )
        .filter((i) => i >= 0)
        .at(-1) ?? -1;
    slides.splice(
      last >= 0 ? last + 1 : Math.max(0, slides.length - 2),
      0,
      slide,
    );
  }
  const unresolved = (a.assessments ?? []).filter(
    (q) => q.reviewStatus === "NEEDS_TEACHER_REVIEW",
  ).length;
  if (unresolved)
    warnings.push({
      code: "UNRESOLVED_ASSESSMENTS",
      severity: "WARNING",
      message: `${unresolved} câu hỏi/tiêu chí chưa duyệt; không tạo câu hỏi chấm điểm thay thế.`,
    });
  const next = refreshPlans({
    ...b,
    sourceAssessments: structuredClone(a.assessments ?? []),
    proposedSlides: allocatePeriodTime(
      slides,
      b.estimatedDurationMinutes,
      b.periodReview,
      b.activityPlan,
    ),
    assessmentPlan: {
      ...b.assessmentPlan,
      targetQuestionCount: eligible.length,
      recommendedQuestionTypes: eligible.length
        ? ["MULTIPLE_CHOICE", "TRUE_FALSE"]
        : [],
    },
  });
  next.warnings = [
    ...validateLessonBlueprint(next, a),
    ...b.warnings.filter(
      (w) => !["ASSESSMENT", "ASSESSMENT_GAP"].includes(w.code),
    ),
    ...warnings,
  ];
  return next;
}
