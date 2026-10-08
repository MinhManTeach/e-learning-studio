// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LessonImportWizard } from "../src/import/LessonImportWizard";
import { AnalysisReview } from "../src/import/AnalysisReview";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan } from "../src/import/documents";
afterEach(cleanup);
it("shows unknown grade and its separate confirmation status", async () => {
  const a = await new DeterministicLessonAnalysisProvider().analyze(
    importPastedPlan("Bài: Bài học kiểm thử"),
  );
  render(
    <AnalysisReview
      analysis={a}
      edit={() => {}}
      back={() => {}}
      reanalyze={() => {}}
      confirm={() => {}}
    />,
  );
  expect(
    screen.getByLabelText("Lớp chương trình").getAttribute("placeholder"),
  ).toBe("Chưa xác định");
  expect(
    (screen.getByLabelText("Lớp học sinh") as HTMLInputElement).value,
  ).toBe("");
  expect(screen.getAllByText(/Chưa xác định.*Chưa xác nhận/).length).toBe(2);
});

it("blocks the unknown-grade wizard path instead of silently using grade 4, then accepts an explicit teacher grade", async () => {
  render(<LessonImportWizard active initialMode="paste" onClose={() => {}} />);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
    { target: { value: "Bài: Kiểm thử\nYêu cầu cần đạt:\n- Nhận biết mẫu." } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
  );
  await screen.findByRole("heading", { name: "Đã phân tích kế hoạch bài dạy" });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận & tiếp tục" }));
  expect(await screen.findByText(/nhập và xác nhận lớp học sinh/)).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Đề xuất kịch bản bài giảng" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Lớp học sinh"), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận & tiếp tục" }));
  expect(
    await screen.findByRole("heading", { name: "Đề xuất kịch bản bài giảng" }),
  ).toBeTruthy();
});
