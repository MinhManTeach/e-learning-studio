import type { PedagogicalAnalysis, TeachingActivity } from "../import/model";
import { generationSafeAnalysis } from "../import/assessments";
import { learnerText } from "../generation/language";
import { mapActivityStage } from "./design";
import { allocatePeriodTime } from "./periodTime";
import {
  outcomeCatalog,
  type BlueprintSlide,
  type LessonBlueprint,
} from "./model";
import { selectedActivities, periodReviewWarnings } from "./periods";
import { refreshPlans, validateLessonBlueprint } from "./validation";

export function activityAllocation(t: TeachingActivity) {
  const parent = t.activityDurationMinutes ?? t.estimatedMinutes;
  const children = t.subactivities ?? [];
  const complete =
    children.length > 0 && children.every((c) => c.estimatedMinutes !== null);
  const childTotal = children.reduce(
    (n, c) => n + (c.estimatedMinutes ?? 0),
    0,
  );
  return {
    minutes: parent ?? (complete ? childTotal : null),
    complete: parent !== null || complete,
    conflict:
      parent !== null &&
      children.length > 0 &&
      (childTotal > parent || (complete && childTotal !== parent)),
  };
}
export function learnerActivityLines(t: TeachingActivity) {
  const seen = new Set<string>();
  return [...t.studentActivity, ...t.content, ...t.goals]
    .flatMap((v) => v.split(/\n/u))
    .filter(
      (v) =>
        !/^\s*[-•\s]*(?:GV\b|giáo viên\b|đáp án|HS\s+(?:lắng nghe|nhận xét|trả lời|báo cáo|ghi nhớ)\s*[.!…]*$|học sinh\s+lắng nghe|(?:phiếu học tập|đánh giá|mục tiêu|nội dung|sản phẩm|tổ chức thực hiện)\s*[:.]?\s*$)/iu.test(
          v,
        ),
    )
    .filter((v) => {
      const bare = v.replace(/^\s*[-•\s]*(?:HS|học sinh)\s*/iu, "").trim();
      return (
        !/^(?:lắng nghe\b|nhận xét câu trả lời của bạn\b|ghi nhớ\s*[.!…]*$|trả lời câu hỏi(?:\s+cá nhân)?\s*[.!…]*$|(?:tổ chức|yêu cầu|hướng dẫn)\s+(?:HS|học sinh)\b)/iu.test(
          bare,
        ) &&
        !/^(?:thảo luận[,\s]*)?trả lời\s*:\s*(?:[A-F1-9](?:[,.\s]+|$)|đúng\b|sai\b)+[.!\s]*$/iu.test(
          bare,
        )
      );
    })
    .map(learnerText)
    .filter((v) => {
      const key = v
        .toLocaleLowerCase("vi")
        .replace(/^em\s+(?:hãy\s+)?/u, "")
        .replace(/[\p{P}\s]+/gu, " ")
        .trim();
      if (!/[\p{L}\p{N}]/u.test(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function buildActivityBlueprint(
  a: PedagogicalAnalysis,
  seed: LessonBlueprint,
): LessonBlueprint {
  const safe = generationSafeAnalysis(a);
  const activities = selectedActivities(safe);
  const originals = new Map(a.teachingActivities.map((t) => [t.id, t]));
  const outcomes = outcomeCatalog(a);
  const slides: BlueprintSlide[] = seed.proposedSlides.filter((s) =>
    ["WELCOME", "OBJECTIVES"].includes(s.type),
  );
  const plans: NonNullable<LessonBlueprint["activityPlan"]> = [];
  const warnings = [...periodReviewWarnings(a)];
  for (const t of activities) {
    const lines = learnerActivityLines(t);
    const allocation = activityAllocation(t);
    const id = `${a.id}:activity-slide:${t.id}`;
    plans.push({
      activity: originals.get(t.id)!,
      slideIds: lines.length ? [id] : [],
      sourceDurationMinutes: allocation.minutes,
      complete: allocation.complete,
      conflict: allocation.conflict,
    });
    if (allocation.conflict)
      warnings.push({
        code: "ACTIVITY_TIME_CONFLICT",
        severity: "WARNING",
        message: `${t.title}: thời lượng cha/con mâu thuẫn; giữ nguyên để đối chiếu.`,
      });
    if (!lines.length) {
      warnings.push({
        code: "ACTIVITY_REVIEW",
        severity: "WARNING",
        message: `${t.title}: chưa đủ nội dung học sinh; giữ nguồn để giáo viên bổ sung.`,
      });
      continue;
    }
    if (lines.length > 3)
      warnings.push({
        code: "ACTIVITY_DETAILS",
        severity: "INFO",
        message: `${t.title}: đề cương lấy 3 nhiệm vụ trọng tâm; toàn bộ nội dung vẫn có trong đối chiếu hoạt động.`,
      });
    const stage = mapActivityStage(t) ?? "DISCOVERY";
    const sourceContext = t.source
      ? [
          {
            blockId: t.source.blockId,
            row: t.source.row,
            column: t.source.column,
            activityId: t.id,
          },
        ]
      : [];
    slides.push({
      id,
      order: slides.length + 1,
      type: stage === "OPENING" ? "WARMUP" : "CONTENT",
      stage,
      title: t.title,
      pedagogicalPurpose:
        t.goals[0] || `Em khám phá và thực hiện nhiệm vụ: ${t.title}`,
      contentOutline: lines.slice(0, 3),
      estimatedMinutes: 1,
      sourceOutcomeIds: outcomes
        .filter((o) =>
          lines.some((v) => v.toLowerCase().includes(o.text.toLowerCase())),
        )
        .map((o) => o.id),
      sourceActivityIds: [t.id],
      sourcePeriodId: t.periodId,
      sourceContext,
      interactionIntent: {
        type: "SHORT_PRACTICE",
        description: "Thực hiện nhiệm vụ và chia sẻ cách làm với giáo viên.",
      },
      mediaIntent: {
        type: "IMAGE",
        purpose: `Hỗ trợ quan sát trong ${t.title}`,
        visualDescription:
          "Cần giáo viên chọn hình phù hợp với hoạt động nguồn.",
        required: false,
      },
    });
  }
  const review = a.periodReview;
  const minutes = review?.totalDurationMinutes ?? seed.estimatedDurationMinutes;
  for (const p of a.teachingPeriods ?? []) {
    if (!review?.selectedPeriodIds.includes(p.id)) continue;
    const entries = plans.filter((t) => t.activity.periodId === p.id);
    const allocated = entries.reduce(
      (n, t) => n + (t.sourceDurationMinutes ?? 0),
      0,
    );
    const budget = review.minutesPerPeriod;
    if (
      allocated > budget ||
      (entries.every((t) => t.complete) && allocated !== budget)
    )
      warnings.push({
        code: "ACTIVITY_TIME_CONFLICT",
        severity: "WARNING",
        message: `Tiết ${p.number}: phân bổ nguồn ${allocated} phút, thời lượng xác nhận ${budget} phút.`,
      });
    if (entries.some((t) => !t.complete))
      warnings.push({
        code: "INCOMPLETE_TIME",
        severity: "WARNING",
        message: `Tiết ${p.number}: chưa đủ thời lượng hoạt động; thời gian trang chỉ là đề xuất.`,
      });
  }
  slides.push(
    ...seed.proposedSlides.filter((s) =>
      ["SUMMARY", "COMPLETION"].includes(s.type),
    ),
  );
  let b = refreshPlans({
    ...seed,
    periodReview: review,
    activityPlan: plans,
    estimatedDurationMinutes: minutes,
    durationSource: review ? "TEACHER" : seed.durationSource,
    designRationale:
      "Nhóm nhiệm vụ theo hoạt động và trình tự nguồn. Thời gian trang là đề xuất, không thay đổi phân bổ nguồn.",
    proposedSlides: allocatePeriodTime(slides, minutes, review, plans),
    assessmentPlan: { ...seed.assessmentPlan, targetQuestionCount: 0 },
    warnings: [],
  });
  b.warnings = [...validateLessonBlueprint(b, a), ...warnings];
  return b;
}
