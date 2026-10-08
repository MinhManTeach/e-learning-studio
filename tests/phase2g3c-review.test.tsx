// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { useState } from "react";
import {
  AssessmentReview,
  StudentAssessmentPreview,
} from "../src/import/AssessmentReview";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan } from "../src/import/documents";
import type { Assessment } from "../src/import/assessmentModel";
afterEach(cleanup);
const question = async () =>
  (
    await new DeterministicLessonAnalysisProvider().analyze(
      importPastedPlan("Em chọn gì?\nA. Chuột\nB. Màn hình\nĐáp án: A"),
    )
  ).assessments![0];
function Harness({ q }: { q: Assessment }) {
  const [items, set] = useState([q]);
  return <AssessmentReview items={items} onChange={set} />;
}
it("supports teacher edits confirmation unresolved and exclusion without losing source", async () => {
  render(<Harness q={await question()} />);
  fireEvent.change(screen.getByLabelText("Đáp án 1"), {
    target: { value: "B" },
  });
  fireEvent.click(screen.getByText("Xác nhận câu hỏi 1"));
  expect(screen.getByText(/1. Em chọn gì.*Đã xác nhận/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Lựa chọn 1"), {
    target: { value: "A. Chuột\nB. Bàn phím" },
  });
  expect(screen.getByText(/1. Em chọn gì.*Cần giáo viên/)).toBeTruthy();
  expect((screen.getByLabelText("Đáp án 1") as HTMLTextAreaElement).value).toBe(
    "B",
  );
  fireEvent.click(screen.getByText("Loại khỏi bài học 1"));
  expect(screen.getByText(/1. Em chọn gì.*Đã loại/)).toBeTruthy();
  expect(screen.getByText("Đáp án: A", { exact: false })).toBeTruthy();
});
it("hides keys from the rendered student preview until submission", async () => {
  const q = {
    ...(await question()),
    reviewStatus: "READY" as const,
    feedback: "Phản hồi riêng",
  };
  const r = render(<StudentAssessmentPreview item={q} />);
  expect(screen.queryByText(/Đáp án|Phản hồi riêng/)).toBeNull();
  r.rerender(<StudentAssessmentPreview item={q} submitted />);
  expect(screen.getByText(/Đáp án sau khi nộp: A Phản hồi riêng/)).toBeTruthy();
});
it("renders a meaningful empty state", () => {
  render(<AssessmentReview items={[]} onChange={() => {}} />);
  expect(screen.getByRole("status").textContent).toContain("Chưa tìm thấy");
});
