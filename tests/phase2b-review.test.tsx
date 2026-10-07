// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan } from "../src/import/documents";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import {
  createBlueprintDraft,
  editSlide,
  addSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  restoreProposal,
  regenerateDraft,
  approveBlueprint,
} from "../src/blueprint/draft";
import { BlueprintReview } from "../src/blueprint/BlueprintReview";
import { validateLessonBlueprint } from "../src/blueprint/validation";

// jsdom does not implement the native modal-dialog API.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};

async function setup() {
  const a = await new DeterministicLessonAnalysisProvider().analyze(
    importPastedPlan(
      "Môn: Tin học\nLớp: 4\nBài: Tìm thông tin\nThời lượng: 35 phút\nYêu cầu cần đạt:\n- Giải thích cách tìm thông tin.\nNội dung trọng tâm:\n- Chọn nguồn đáng tin cậy.",
    ),
  );
  const b = await new DeterministicLessonBlueprintProvider().generate(a);
  return { a, b, draft: createBlueprintDraft(b) };
}
afterEach(cleanup);
describe("Phase 2B editable source of truth", () => {
  it("edits independently, adds, duplicates, deletes and reorders with unique stable IDs", async () => {
    const { a, b, draft } = await setup();
    const snapshot = JSON.stringify(a);
    let d = editSlide(draft, b.proposedSlides[0].id, { title: "Tên mới" });
    expect(d.current.proposedSlides[0].title).toBe("Tên mới");
    expect(d.proposal.proposedSlides[0].title).toBe(b.proposedSlides[0].title);
    d = duplicateSlide(d, b.proposedSlides[2].id);
    d = addSlide(d);
    const id = d.current.proposedSlides.at(-2)!.id;
    d = moveSlide(d, id, 2);
    expect(d.current.proposedSlides[2].id).toBe(id);
    d = deleteSlide(d, id);
    expect(new Set(d.current.proposedSlides.map((s) => s.id)).size).toBe(
      d.current.proposedSlides.length,
    );
    expect(d.current.proposedSlides.map((s) => s.order)).toEqual(
      d.current.proposedSlides.map((_, i) => i + 1),
    );
    expect(JSON.stringify(a)).toBe(snapshot);
  });
  it("requires explicit confirmation to regenerate or restore edited drafts", async () => {
    const { b, draft } = await setup();
    const edited = editSlide(draft, b.proposedSlides[0].id, {
      title: "Giữ tôi",
    });
    expect(() => regenerateDraft(edited, b, false)).toThrow(/chỉnh sửa/);
    expect(() => restoreProposal(edited, false)).toThrow(/chỉnh sửa/);
    expect(restoreProposal(edited, true).current).toEqual(draft.proposal);
    expect(regenerateDraft(edited, b, true).edited).toBe(false);
  });
  it("approves the current edited blueprint and resets approval on further changes", async () => {
    const { a, b, draft } = await setup();
    const edited = editSlide(draft, b.proposedSlides[0].id, {
      title: "Đã duyệt tên này",
    });
    const approved = approveBlueprint(edited, a);
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.current.proposedSlides[0].title).toBe("Đã duyệt tên này");
    expect(
      editSlide(approved, b.proposedSlides[0].id, { title: "Lại sửa" })
        .approvedAt,
    ).toBeNull();
    expect(() =>
      approveBlueprint(deleteSlide(edited, b.proposedSlides.at(-1)!.id), a),
    ).toThrow();
  });
  it("shows editable review, regeneration cancel keeps edits, restore works", async () => {
    const { a, draft } = await setup();
    render(
      <BlueprintReview
        analysis={a}
        initialDraft={draft}
        back={() => {}}
        close={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Đề xuất kịch bản bài giảng" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sửa trang 1" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề trang" }), {
      target: { value: "Tên đã sửa" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Loại học liệu" }), {
      target: { value: "ILLUSTRATION" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Mô tả hình minh họa" }),
      { target: { value: "Hai nguồn thông tin cho học sinh lớp 4" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo lại kịch bản" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("thay thế các chỉnh sửa");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    expect(screen.getByRole("heading", { name: "Tên đã sửa" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục đề xuất" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Khôi phục",
      }),
    );
    expect(screen.queryByRole("heading", { name: "Tên đã sửa" })).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: /Tạo bài giảng/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("reports uncovered outcomes and excessive repetition independently of objective slides", async () => {
    const { a, b } = await setup();
    const uncovered = {
      ...b,
      proposedSlides: b.proposedSlides.map((s) => ({
        ...s,
        sourceOutcomeIds: [],
      })),
    };
    expect(
      validateLessonBlueprint(uncovered, a).some(
        (w) => w.code === "UNCOVERED_OUTCOME",
      ),
    ).toBe(true);
    const o = b.assessmentPlan.coverage[0].outcomeId;
    const repeated = {
      ...b,
      proposedSlides: [
        ...b.proposedSlides,
        ...Array.from({ length: 6 }, (_, i) => ({
          ...b.proposedSlides[2],
          id: `extra${i}`,
          order: b.proposedSlides.length + i + 1,
          sourceOutcomeIds: [o],
        })),
      ],
    };
    expect(
      validateLessonBlueprint(repeated, a).some(
        (w) => w.code === "EXCESSIVE_COVERAGE",
      ),
    ).toBe(true);
  });
});
