import { allocateTime } from "./design";
import type { BlueprintSlide, LessonBlueprint } from "./model";
import type { PeriodReview } from "./periods";
export function allocatePeriodTime(
  slides: BlueprintSlide[],
  minutes: number,
  review?: PeriodReview,
  activities?: LessonBlueprint["activityPlan"],
) {
  if (!review) return allocateTime(slides, minutes);
  const first = review.selectedPeriodIds[0],
    last = review.selectedPeriodIds.at(-1)!;
  const assigned = slides.map((s) => ({
    ...s,
    plannedPeriodId:
      s.sourcePeriodId && review.selectedPeriodIds.includes(s.sourcePeriodId)
        ? s.sourcePeriodId
        : ["SUMMARY", "COMPLETION"].includes(s.type)
          ? last
          : first,
  }));
  const timed = new Map(
    review.selectedPeriodIds
      .flatMap((id) =>
        allocateTime(
          assigned.filter((s) => s.plannedPeriodId === id),
          review.minutesPerPeriod,
        ),
      )
      .map((s) => [s.id, s]),
  );
  // Keep source activity budgets; missing period time remains unresolved.
  if (activities?.length) {
    for (const periodId of review.selectedPeriodIds) {
      const local = assigned.filter((s) => s.plannedPeriodId === periodId);
      const parents = activities.filter(
        (a) =>
          a.activity.periodId === periodId &&
          local.some((s) => s.sourceActivityIds?.includes(a.activity.id)),
      );
      const groups = new Map<string, BlueprintSlide[]>();
      for (const s of local) {
        const parent =
          parents.find((a) => s.sourceActivityIds?.includes(a.activity.id)) ??
          (["SUMMARY", "COMPLETION"].includes(s.type)
            ? parents.at(-1)
            : parents[0]);
        const key = parent?.activity.id ?? "unassigned";
        groups.set(key, [...(groups.get(key) ?? []), s]);
      }
      for (const [id, group] of groups) {
        const budget = parents.find(
          (a) => a.activity.id === id,
        )?.sourceDurationMinutes;
        for (const s of allocateTime(
          group,
          budget && budget > 0 ? budget : group.length,
        ))
          timed.set(s.id, s);
      }
    }
  }
  return assigned.map((s) => timed.get(s.id)!);
}
