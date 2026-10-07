// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { LessonImportWizard } from "../src/import/LessonImportWizard";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan } from "../src/import/documents";
import {
  LessonAnalysisService,
  SemanticLessonAnalysisProvider,
} from "../src/import/analysisService";
import type {
  LessonAnalysisProvider,
  PedagogicalAnalysis,
} from "../src/import/model";
afterEach(cleanup);
describe("Phase 2A functional controls", () => {
  it("renders semantic service results, source badge, medium confidence and collapsed uncertain review", async () => {
    const service = new LessonAnalysisService(
      new SemanticLessonAnalysisProvider({
        id: "ui-test",
        name: "Test adapter",
        async analyze(input) {
          const sourceBlockIds = [input.blocks[0].id];
          return {
            lessonIdentity: { subject: "Tin học" },
            learningOutcomes: [
              {
                text: "Mục tiêu cần đối chiếu",
                confidence: 0.7,
                sourceBlockIds,
              },
            ],
            knowledgeObjectives: [],
            competencies: [],
            qualities: [],
            teachingActivities: [],
            assessmentEvidence: [],
            digitalCompetencyIntegration: [],
            aiIntegration: [],
            specialNeedsSupport: [],
            keyKnowledge: [],
            uncertainItems: [
              { text: "Nội dung chưa rõ", confidence: 0.3, sourceBlockIds },
            ],
            warnings: [],
          };
        },
      }),
    );
    render(
      <LessonImportWizard
        active
        initialMode="paste"
        onClose={() => {}}
        service={service}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
      { target: { value: "Học sinh tìm kiếm thông tin" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
    );
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    expect(screen.getAllByText("Phân tích bằng AI").length).toBeGreaterThan(0);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Yêu cầu cần đạt",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Mục tiêu cần đối chiếu");
    expect(
      screen.getByText("Nên kiểm tra", { selector: "small" }),
    ).toBeTruthy();
    const uncertain = screen
      .getByText("Cần thầy/cô kiểm tra · 1 nội dung")
      .closest("details")!;
    expect(uncertain.open).toBe(false);
    fireEvent.click(uncertain.querySelector("summary")!);
    expect(
      screen.getByText("Nội dung chưa rõ", { selector: "blockquote" }),
    ).toBeTruthy();
  });
  it("cancels pending analysis and ignores late results", async () => {
    let finish: (value: PedagogicalAnalysis) => void = () => {};
    let signal: AbortSignal | undefined;
    const source = importPastedPlan("Môn: Toán\nBài: Kiểm tra");
    const result = await new DeterministicLessonAnalysisProvider().analyze(
      source,
    );
    const provider: LessonAnalysisProvider = {
      id: "pending-test",
      name: "Pending test",
      analyze: vi.fn<LessonAnalysisProvider["analyze"]>((_doc, options) => {
        signal = options?.signal;
        return new Promise<PedagogicalAnalysis>((resolve) => {
          finish = resolve;
        });
      }),
    };
    render(
      <LessonImportWizard
        active
        initialMode="paste"
        onClose={() => {}}
        provider={provider}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
      { target: { value: source.rawText } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Dừng và quay lại" }),
    );
    expect(signal?.aborted).toBe(true);
    finish(result);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("heading", {
        name: "E-Learning Studio đã hiểu kế hoạch của thầy/cô như sau",
      }),
    ).toBeNull();
  });
  it("runs paste, edit/add/delete, back/resume, reanalysis cancel and confirm", async () => {
    const close = vi.fn();
    render(<LessonImportWizard active initialMode="paste" onClose={close} />);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
      { target: { value: "Môn: Toán\nBài: Số học\nPhẩm chất\n- Chăm chỉ." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
    );
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    const confirm = screen.getByRole("button", { name: "Xác nhận & tiếp tục" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Thêm ý · Phẩm chất" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Phẩm chất/ }), {
      target: { value: "Chăm chỉ.\nÝ bổ sung." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Xóa ý 2 · Phẩm chất" }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: /^Phẩm chất/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Chăm chỉ.");
    fireEvent.click(screen.getByRole("button", { name: "Bổ sung hoạt động" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tên hoạt động 1" }), {
      target: { value: "Hoạt động mới" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ hoạt động 1" }));
    expect(
      screen.queryByRole("textbox", { name: "Tên hoạt động 1" }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Tên bài học" }), {
      target: { value: "Tên giáo viên sửa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Tiếp tục bản đã kiểm tra" }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: /^Tên bài học/,
        }) as HTMLInputElement
      ).value,
    ).toBe("Tên giáo viên sửa");
    fireEvent.click(screen.getByRole("button", { name: "Phân tích lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Giữ bản chỉnh sửa" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: /^Tên bài học/,
        }) as HTMLInputElement
      ).value,
    ).toBe("Tên giáo viên sửa");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận & tiếp tục" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Đề xuất kịch bản bài giảng",
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Tạo bài giảng",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Về bài giảng gần đây" }),
    );
    expect(close).toHaveBeenCalledOnce();
  });
  it("imports real DOCX through file input, retains columns and resets confirmation after correction", async () => {
    const { container } = render(
      <LessonImportWizard active initialMode="file" onClose={() => {}} />,
    );
    const bytes = readFileSync("src/fixtures/docx/real-lesson-tables.docx");
    const uploaded = new File([bytes], "real.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    Object.defineProperty(uploaded, "arrayBuffer", {
      value: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [uploaded] },
    });
    const raw = await screen.findByRole("textbox", {
      name: "Văn bản từ real.docx",
    });
    expect((raw as HTMLTextAreaElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
    );
    await screen.findByRole("textbox", { name: "Hoạt động của giáo viên 1" });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Hoạt động của học sinh 1",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("Thảo luận");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (
        screen.getByRole("button", {
          name: "Xác nhận & tiếp tục",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Chuyển vào nhóm đã chọn" })[0],
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Xác nhận & tiếp tục",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Phân tích lại" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích lại từ nguồn" }),
    );
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    expect(screen.queryByText(/Đã xử lý bởi giáo viên/)).toBeNull();
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "Hoạt động của học sinh 1",
        })) as HTMLTextAreaElement
      ).value,
    ).toContain("Thảo luận");
  });
  it("imports TXT and preserves previous source on invalid file", async () => {
    const { container } = render(
      <LessonImportWizard active initialMode="file" onClose={() => {}} />,
    );
    const bytes = new TextEncoder().encode("Môn: Toán\nLớp: 2");
    const uploaded = new File([bytes], "lesson.txt");
    Object.defineProperty(uploaded, "arrayBuffer", {
      value: async () => bytes.buffer,
    });
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [uploaded] } });
    const raw = await screen.findByRole("textbox", {
      name: "Văn bản từ lesson.txt",
    });
    expect((raw as HTMLTextAreaElement).value).toContain("Toán");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "unsupported.pdf")] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "sắp hỗ trợ",
    );
    expect((raw as HTMLTextAreaElement).value).toContain("Toán");
  });
  it("navigation aborts pending file read and late file cannot replace input", async () => {
    let finish: (buffer: ArrayBuffer) => void = () => {};
    const close = vi.fn();
    const { container, rerender } = render(
      <LessonImportWizard active initialMode="file" onClose={close} />,
    );
    const uploaded = new File(["x"], "lesson.txt");
    Object.defineProperty(uploaded, "arrayBuffer", {
      value: () =>
        new Promise<ArrayBuffer>((r) => {
          finish = r;
        }),
    });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [uploaded] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bài giảng gần đây" }));
    expect(close).toHaveBeenCalledOnce();
    rerender(
      <LessonImportWizard active={false} initialMode="file" onClose={close} />,
    );
    finish(new TextEncoder().encode("Late text").buffer);
    rerender(<LessonImportWizard active initialMode="paste" onClose={close} />);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("textbox", {
            name: "Nội dung kế hoạch bài dạy",
          }) as HTMLTextAreaElement
        ).value,
      ).toBe(""),
    );
  });
});
