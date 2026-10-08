import { expect, it } from "vitest";
import { periodAnalysis } from "./support/phase2g4Fixture";
import { confirmPeriods } from "../src/blueprint/periods";
import {
  DeterministicLessonBlueprintProvider,
  LessonBlueprintGenerator,
} from "../src/blueprint/generator";
import { activityAllocation } from "../src/blueprint/activityPlan";
const plan = (a = confirmPeriods(periodAnalysis(), ["p1", "p2"], 2, 35)) =>
  new DeterministicLessonBlueprintProvider().generate(a);
it("blocks planning before teacher period confirmation", async () => {
  await expect(
    new LessonBlueprintGenerator().generate({
      analysis: periodAnalysis(),
      confirmedAt: new Date().toISOString(),
    }),
  ).rejects.toThrow(/tiết/);
  expect(
    (await plan(periodAnalysis())).warnings.some(
      (w) => w.code === "PERIOD_CONFIRMATION",
    ),
  ).toBe(true);
});
it("maps only selected activities in source sequence and keeps the source snapshot", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1", "p3"], 2, 35);
  const b = await plan(a);
  expect(b.periodReview).toEqual(a.periodReview);
  expect(b.activityPlan?.map((t) => t.activity.id)).toEqual(["a1", "a3"]);
  expect(b.proposedSlides.flatMap((s) => s.sourceActivityIds ?? [])).toEqual([
    "a1",
    "a3",
  ]);
  expect(b.estimatedDurationMinutes).toBe(70);
  expect(b.durationSource).toBe("TEACHER");
  expect(
    b.proposedSlides.reduce((n, s) => n + s.estimatedMinutes, 0),
  ).toBeCloseTo(30);
  for (const id of ["p1", "p3"])
    expect(
      b.proposedSlides
        .filter((s) => s.plannedPeriodId === id)
        .reduce((n, s) => n + s.estimatedMinutes, 0),
    ).toBeCloseTo(15);
});
it("groups related tasks and filters response-only text and teacher instructions", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1"], 1, 35);
  a.teachingActivities[0].studentActivity = [
    "HS lắng nghe GV nhận xét.",
    "HS nháy chuột vào biểu tượng.",
    "Nháy chuột vào biểu tượng.",
    "GV nhận xét.",
    "........",
    "HS thảo luận, trả lời: A, C",
    "HS trả lời câu hỏi cá nhân.",
  ];
  const b = await plan(a);
  const activitySlides = b.proposedSlides.filter((s) =>
    s.sourceActivityIds?.includes("a1"),
  );
  expect(activitySlides).toHaveLength(1);
  expect(activitySlides[0].contentOutline).toEqual([
    "Em nháy chuột vào biểu tượng.",
  ]);
  expect(b.activityPlan?.[0].activity.studentActivity).toEqual(
    a.teachingActivities[0].studentActivity,
  );
});
it("does not add parent and child durations together", () => {
  const activity = periodAnalysis().teachingActivities[0];
  activity.subactivities = [
    { title: "Bước 1", estimatedMinutes: 5, blockId: "b" },
    { title: "Bước 2", estimatedMinutes: 10, blockId: "b" },
  ];
  expect(activityAllocation(activity)).toEqual({
    minutes: 15,
    complete: true,
    conflict: false,
  });
  activity.subactivities[1].estimatedMinutes = 15;
  expect(activityAllocation(activity).conflict).toBe(true);
  activity.estimatedMinutes = null;
  activity.subactivities[1].estimatedMinutes = null;
  expect(activityAllocation(activity)).toEqual({
    minutes: null,
    complete: false,
    conflict: false,
  });
});
it("reports incomplete and conflicting allocations without modifying source times", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1"], 1, 35);
  a.teachingActivities[0].estimatedMinutes = 50;
  const b = await plan(a);
  expect(b.warnings.some((w) => w.code === "ACTIVITY_TIME_CONFLICT")).toBe(
    true,
  );
  expect(b.activityPlan?.[0].sourceDurationMinutes).toBe(50);
});
