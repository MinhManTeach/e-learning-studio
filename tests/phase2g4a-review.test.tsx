// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AnalysisReview } from "../src/import/AnalysisReview";
import { periodAnalysis } from "./support/phase2g4Fixture";
import {
  continuationDiagnostics,
  groupedSourceReview,
} from "../src/import/reviewDiagnostics";
import { DocumentDiagnostics } from "../src/import/DocumentDiagnostics";
import { importPastedPlan } from "../src/import/documents";
import { within } from "@testing-library/react";
import { editAnalysis } from "../src/import/review";
afterEach(cleanup);
it("renders all seven collapsed groups, exact counts and expanded source evidence", () => {
  const a = periodAnalysis();
  a.unmappedContent = ["Phiếu học tập tổng hợp"];
  a.classifications = [
    {
      id: "sheet",
      blockId: "source9",
      sourceText: a.unmappedContent[0],
      category: "OTHER",
      field: "unmappedContent[0]",
      confidence: 0.4,
      signals: ["Cần đối chiếu bảng"],
      isHeading: false,
      needsReview: true,
      corrected: false,
      row: 1,
      column: 2,
    },
  ];
  const snapshot = structuredClone(a);
  const { container } = render(
    <DocumentDiagnostics
      document={importPastedPlan("Nguồn tổng hợp")}
      analysis={a}
      correct={vi.fn()}
    />,
  );
  const outer = container.querySelector(".uncertain-review")!;
  expect(outer.querySelectorAll(":scope > details")).toHaveLength(7);
  const worksheet = screen
    .getByText("Phiếu học tập · 1 nội dung")
    .closest("details")!;
  expect(worksheet.open).toBe(false);
  fireEvent.click(outer.querySelector("summary")!);
  fireEvent.click(worksheet.querySelector("summary")!);
  const trace = within(worksheet)
    .getByText("Đối chiếu nguồn · unmapped-0")
    .closest("details")!;
  fireEvent.click(trace.querySelector("summary")!);
  expect(trace.open).toBe(true);
  expect(trace.textContent).toContain("source9 · hàng 2, cột 3");
  expect(trace.textContent).toContain("0.40");
  expect(trace.textContent).toContain("Cần đối chiếu bảng");
  expect(a).toEqual(snapshot);
});
it("shows teacher-edited current content alongside retained original source", () => {
  const a = periodAnalysis();
  a.unmappedContent = ["Ghi chú giáo viên sửa"];
  a.classifications = [
    {
      id: "original",
      blockId: "original-block",
      sourceText: "Ghi chú nguồn gốc",
      category: "OTHER",
      field: "",
      confidence: 0.3,
      signals: [],
      isHeading: false,
      needsReview: false,
      corrected: true,
    },
  ];
  render(
    <DocumentDiagnostics
      document={importPastedPlan("Nguồn gốc")}
      analysis={a}
      correct={vi.fn()}
    />,
  );
  expect(
    screen.getByText("Ghi chú giáo viên sửa", { selector: "blockquote" }),
  ).toBeTruthy();
  expect(
    screen.getByText("Ghi chú nguồn gốc", { selector: "blockquote" }),
  ).toBeTruthy();
  expect(screen.getByText(/Đã xử lý bởi giáo viên/)).toBeTruthy();
});
it("changing period selection invalidates period approval alone, while content edits invalidate responsibility", () => {
  function Harness() {
    const [a, set] = useState(periodAnalysis());
    return (
      <AnalysisReview
        analysis={a}
        edit={(field, value) => set(editAnalysis(a, field, value as never))}
        back={vi.fn()}
        reanalyze={vi.fn()}
        confirm={vi.fn()}
      />
    );
  }
  render(<Harness />);
  const responsibility = screen.getByLabelText(
    /Tôi đã kiểm tra/,
  ) as HTMLInputElement;
  fireEvent.click(responsibility);
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(
    screen.getByRole("button", { name: "Xác nhận lựa chọn tiết" }),
  );
  expect(responsibility.checked).toBe(true);
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  expect(responsibility.checked).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: /Xác nhận & tiếp tục/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Tên bài học"), {
    target: { value: "Sửa sau xác nhận" },
  });
  expect(responsibility.checked).toBe(false);
});
it("explains the effective grade guard without inventing a grade", () => {
  const a = periodAnalysis();
  a.targetAudienceGrade = "35";
  render(
    <AnalysisReview
      analysis={a}
      edit={vi.fn()}
      back={vi.fn()}
      reanalyze={vi.fn()}
      confirm={vi.fn()}
    />,
  );
  expect(screen.getByText(/Tạo kịch bản cần lớp từ 1 đến 12/)).toBeTruthy();
  expect(
    (screen.getByLabelText("Lớp học sinh") as HTMLInputElement).value,
  ).toBe("35");
});
it("reports period confirmation even after responsibility is checked", () => {
  const a = periodAnalysis();
  expect(continuationDiagnostics(a, true)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "periodReview", severity: "BLOCKING" }),
    ]),
  );
  render(
    <AnalysisReview
      analysis={a}
      edit={vi.fn()}
      back={vi.fn()}
      reanalyze={vi.fn()}
      confirm={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByLabelText(/Tôi đã kiểm tra/));
  expect(
    (
      screen.getByRole("button", {
        name: /Xác nhận & tiếp tục/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByLabelText("Điều kiện tiếp tục").textContent).toContain(
    "Chọn tiết nguồn",
  );
});
it("requires both confirmations, preserves edits and the three-period source", () => {
  let latest = periodAnalysis();
  const confirm = vi.fn();
  function Harness() {
    const [a, set] = useState(latest);
    latest = a;
    return (
      <AnalysisReview
        analysis={a}
        edit={(field, value) => set({ ...a, [field]: value })}
        back={vi.fn()}
        reanalyze={vi.fn()}
        confirm={confirm}
      />
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Tên bài học"), {
    target: { value: "Giáo viên sửa tên" },
  });
  const checks = screen.getAllByRole("checkbox");
  fireEvent.click(checks[0]);
  fireEvent.click(checks[1]);
  fireEvent.click(
    screen.getByRole("button", { name: "Xác nhận lựa chọn tiết" }),
  );
  const next = screen.getByRole("button", {
    name: /Xác nhận & tiếp tục/,
  }) as HTMLButtonElement;
  expect(next.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/Tôi đã kiểm tra/));
  expect(next.disabled).toBe(false);
  fireEvent.click(next);
  expect(confirm).toHaveBeenCalledOnce();
  expect(latest.lessonTitle).toBe("Giáo viên sửa tên");
  expect(latest.periodReview?.totalDurationMinutes).toBe(70);
  expect(latest.durationMinutes).toBe(105);
  expect(latest.teachingPeriods).toHaveLength(3);
  expect(latest.teachingActivities).toHaveLength(3);
});
it("groups source review without mutation or losing unmatched content", () => {
  const a = periodAnalysis();
  a.unmappedContent = ["Phiếu học tập giữ nguyên", "Ghi chú chưa có trace"];
  a.classifications = [
    {
      id: "c",
      blockId: "b9",
      sourceText: "Phiếu học tập giữ nguyên",
      field: "unmappedContent[0]",
      category: "OTHER",
      confidence: 0.4,
      needsReview: true,
      isHeading: false,
      corrected: false,
      signals: ["worksheet context"],
    },
  ];
  const before = structuredClone(a);
  const groups = groupedSourceReview(a);
  expect(groups.flatMap((g) => g.items)).toHaveLength(2);
  expect(groups.find((g) => g.key === "worksheets")?.items[0]).toMatchObject({
    text: a.unmappedContent[0],
    blockId: "b9",
    confidence: 0.4,
  });
  expect(a).toEqual(before);
  expect(
    continuationDiagnostics({ ...a, teachingPeriods: [] }, true).every(
      (d) => d.severity !== "BLOCKING",
    ),
  ).toBe(true);
});
