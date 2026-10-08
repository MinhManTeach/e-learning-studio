// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { PeriodSelection } from "../src/blueprint/PeriodSelection";
import { periodAnalysis } from "./support/phase2g4Fixture";
import { confirmPeriods } from "../src/blueprint/periods";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import {
  createBlueprintDraft,
  editSlide,
  regenerateDraft,
  deleteSlide,
} from "../src/blueprint/draft";
afterEach(cleanup);
it("requires explicit period checks and invalidates confirmation on change", () => {
  function Harness() {
    const [a, set] = useState(periodAnalysis());
    return (
      <PeriodSelection
        analysis={a}
        change={(periodReview) => set({ ...a, periodReview })}
      />
    );
  }
  render(<Harness />);
  const check = screen.getAllByRole("checkbox");
  expect(check.every((c) => !(c as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(check[0]);
  fireEvent.click(check[2]);
  fireEvent.click(
    screen.getByRole("button", { name: "Xác nhận lựa chọn tiết" }),
  );
  expect(screen.getByRole("status").textContent).toContain("2 tiết · 70 phút");
  fireEvent.click(check[2]);
  expect(screen.queryByRole("status")).toBeNull();
});
it("regeneration preserves explicit teacher slide edits, ordering, deletions and selected periods", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1", "p3"], 2, 35);
  const p = new DeterministicLessonBlueprintProvider();
  const b = await p.generate(a);
  let d = editSlide(createBlueprintDraft(b), b.proposedSlides[2].id, {
    title: "Tiêu đề giáo viên",
  });
  d = deleteSlide(d, b.proposedSlides[3].id);
  const regenerated = regenerateDraft(d, await p.generate(a), true);
  expect(regenerated.current.proposedSlides).toEqual(d.current.proposedSlides);
  expect(regenerated.current.periodReview).toEqual(d.current.periodReview);
  expect(regenerated.approvedAt).toBeNull();
});
