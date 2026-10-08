import { expect, it } from "vitest";
import { periodAnalysis } from "./support/phase2g4Fixture";
import {
  confirmPeriods,
  periodReviewWarnings,
  selectedActivities,
} from "../src/blueprint/periods";

it("requires explicit selection instead of approving every source period", () => {
  expect(() => confirmPeriods(periodAnalysis(), [], 2, 35)).toThrow();
  expect(
    periodReviewWarnings(periodAnalysis()).some((w) => w.severity === "ERROR"),
  ).toBe(true);
});
it("retains source declaration and confirms 2 x 35 = 70", () => {
  const a = periodAnalysis();
  const next = confirmPeriods(a, ["p1", "p2"], 2, 35);
  expect(next.periodReview?.totalDurationMinutes).toBe(70);
  expect(next.durationMinutes).toBe(105);
  expect(next.teachingPeriods).toEqual(a.teachingPeriods);
  expect(
    periodReviewWarnings(next).some((w) => w.code === "PERIOD_MISMATCH"),
  ).toBe(true);
});
it("selects periods 1 and 3 without guessing contiguous periods", () => {
  const a = confirmPeriods(periodAnalysis(), ["p1", "p3"], 2, 35);
  expect(selectedActivities(a).map((x) => x.id)).toEqual(["a1", "a3"]);
});
it("rejects unknown duplicate or inconsistent period selections", () => {
  const a = periodAnalysis();
  expect(() => confirmPeriods(a, ["p1", "missing"], 2, 35)).toThrow();
  expect(() => confirmPeriods(a, ["p1", "p1"], 2, 35)).toThrow();
  expect(() => confirmPeriods(a, ["p1"], 2, 35)).toThrow();
});
