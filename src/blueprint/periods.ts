import { z } from "zod";
import type { PedagogicalAnalysis } from "../import/model";
import type { BlueprintWarning } from "./model";

export const periodReviewSchema = z.object({
  selectedPeriodIds: z.array(z.string()).min(1),
  periodCount: z.number().int().positive(),
  minutesPerPeriod: z.number().positive(),
  totalDurationMinutes: z.number().positive(),
  confirmedAt: z.iso.datetime(),
  assignedAssessmentIds: z.array(z.string()).default([]),
  includedUnassignedActivityIds: z.array(z.string()).default([]),
});
export type PeriodReview = z.infer<typeof periodReviewSchema>;
export function periodReviewWarnings(
  a: PedagogicalAnalysis,
): BlueprintWarning[] {
  if (!a.teachingPeriods?.length) return [];
  const r = a.periodReview;
  if (!r)
    return [
      {
        code: "PERIOD_CONFIRMATION",
        severity: "ERROR",
        message:
          "Chọn tiết nguồn và xác nhận thời lượng trước khi tạo kịch bản.",
      },
    ];
  const ids = new Set(r.selectedPeriodIds);
  if (
    !ids.size ||
    ids.size !== r.selectedPeriodIds.length ||
    ids.size !== r.periodCount ||
    r.selectedPeriodIds.some(
      (id) => !a.teachingPeriods!.some((p) => p.id === id),
    ) ||
    r.totalDurationMinutes !== r.periodCount * r.minutesPerPeriod
  )
    return [
      {
        code: "PERIOD_CONFIRMATION",
        severity: "ERROR",
        message: "Lựa chọn tiết hoặc thời lượng xác nhận không hợp lệ.",
      },
    ];
  return a.periodCount !== r.periodCount ||
    a.durationMinutes !== r.totalDurationMinutes
    ? [
        {
          code: "PERIOD_MISMATCH",
          severity: "WARNING",
          message: `Nguồn: ${a.periodCount ?? "?"} tiết, ${a.durationMinutes ?? "?"} phút. Giáo viên xác nhận: ${r.periodCount} tiết, ${r.totalDurationMinutes} phút. Nội dung bị loại vẫn được giữ trong nguồn.`,
        },
      ]
    : [];
}
export function confirmPeriods(
  a: PedagogicalAnalysis,
  ids: string[],
  count: number,
  minutes: number,
): PedagogicalAnalysis {
  const periodReview = periodReviewSchema.parse({
    selectedPeriodIds: [...ids].sort(
      (x, y) =>
        (a.teachingPeriods?.findIndex((p) => p.id === x) ?? -1) -
        (a.teachingPeriods?.findIndex((p) => p.id === y) ?? -1),
    ),
    periodCount: count,
    minutesPerPeriod: minutes,
    totalDurationMinutes: count * minutes,
    confirmedAt: new Date().toISOString(),
    assignedAssessmentIds: a.periodReview?.assignedAssessmentIds ?? [],
    includedUnassignedActivityIds:
      a.periodReview?.includedUnassignedActivityIds ?? [],
  });
  const next = { ...a, periodReview };
  if (periodReviewWarnings(next).some((w) => w.severity === "ERROR"))
    throw new Error("Lựa chọn tiết không hợp lệ.");
  return next;
}
export function selectedActivities(a: PedagogicalAnalysis) {
  if (!a.teachingPeriods?.length) return a.teachingActivities;
  return a.teachingActivities.filter((t) =>
    t.periodId
      ? a.periodReview?.selectedPeriodIds.includes(t.periodId)
      : a.periodReview?.includedUnassignedActivityIds.includes(t.id),
  );
}
