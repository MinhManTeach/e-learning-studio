// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { StudentPreview } from "../src/player/StudentPreview";
afterEach(cleanup);
it("renders objective introduction before balanced, exact-deduplicated objectives", () => {
  const p = createProject();
  const s = createSlide("objectives");
  s.data.keyMessages = ["Sau bài học, em có thể:"];
  s.data.learningOutcomes = [
    "Tìm thông tin",
    "Tìm thông tin",
    "Kiểm tra nguồn",
  ];
  p.slides = [s];
  render(<SlideCanvas project={p} slide={s} />);
  expect(screen.getAllByText("Tìm thông tin")).toHaveLength(1);
  expect(
    screen
      .getByText("Sau bài học, em có thể:")
      .compareDocumentPosition(screen.getByText("Tìm thông tin")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it("presents long scenario in controlled steps and retains recommended feedback", () => {
  const p = createProject();
  const s = createSlide("scenario");
  s.data.situation = "5.A1.1 Con người chịu trách nhiệm. ".repeat(20);
  s.data.choices[0].feedback = "Kiểm tra và tự chịu trách nhiệm";
  p.slides = [s];
  render(<StudentPreview project={p} initialId={s.id} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Đọc xong — chọn cách xử lý" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(s.data.choices[0].text) }),
  );
  expect(screen.getByText("Kiểm tra và tự chịu trách nhiệm")).toBeTruthy();
  expect(screen.getByText("Xem lại tình huống").tagName).toBe("SUMMARY");
});
