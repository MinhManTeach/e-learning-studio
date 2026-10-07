// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonImportWizard } from "../src/import/LessonImportWizard";
import {
  LessonAnalysisService,
  SemanticLessonAnalysisProvider,
} from "../src/import/analysisService";
import { AiSettings } from "../src/import/AiSettings";
afterEach(cleanup);
const result = {
  lessonIdentity: { lessonTitle: "Bài nguồn" },
  learningOutcomes: [],
  knowledgeObjectives: [],
  competencies: [],
  qualities: [],
  teachingActivities: [],
  assessmentEvidence: [],
  digitalCompetencyIntegration: [],
  aiIntegration: [],
  specialNeedsSupport: [],
  keyKnowledge: [],
  uncertainItems: [],
  warnings: [],
};
function enter() {
  fireEvent.change(
    screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
    {
      target: {
        value:
          "Môn: Tin học\nBài: Thông tin\nI. Mục tiêu\n- Giải thích được thông tin.",
      },
    },
  );
}
describe("personal AI review workflow", () => {
  it("shows an explicit fallback warning when configured AI fails", async () => {
    const service = new LessonAnalysisService(
      new SemanticLessonAnalysisProvider({
        id: "test",
        name: "test",
        async analyze() {
          throw new Error("network");
        },
      }),
    );
    render(
      <LessonImportWizard
        active
        initialMode="paste"
        onClose={() => {}}
        service={service}
        aiConfigured
      />,
    );
    enter();
    fireEvent.click(screen.getByRole("button", { name: "Phân tích bằng AI" }));
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    expect(
      screen.getByText(/Không thể kết nối AI. Kết quả hiện tại được tạo bằng/),
    ).toBeTruthy();
  });
  it("keeps manual corrections on failed AI retry, then allows successful retry", async () => {
    let fails = false;
    const service = new LessonAnalysisService(
      new SemanticLessonAnalysisProvider({
        id: "test",
        name: "test",
        async analyze() {
          if (fails) throw new Error("unavailable");
          return result;
        },
      }),
    );
    render(
      <LessonImportWizard
        active
        initialMode="paste"
        onClose={() => {}}
        service={service}
        aiConfigured
      />,
    );
    enter();
    fireEvent.click(screen.getByRole("button", { name: "Phân tích bằng AI" }));
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Tên bài học" }), {
      target: { value: "Bản sửa của giáo viên" },
    });
    fails = true;
    fireEvent.click(screen.getByRole("button", { name: "Phân tích lại" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích lại từ nguồn" }),
    );
    await screen.findByRole("alert");
    expect(
      (screen.getByRole("textbox", { name: "Tên bài học" }) as HTMLInputElement)
        .value,
    ).toBe("Bản sửa của giáo viên");
    expect(screen.getByRole("alert").textContent).toContain(
      "Đã giữ nguyên bản chỉnh sửa",
    );
    fails = false;
    fireEvent.click(screen.getByRole("button", { name: "Phân tích lại" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Phân tích lại từ nguồn" }),
    );
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    expect(
      (screen.getByRole("textbox", { name: "Tên bài học" }) as HTMLInputElement)
        .value,
    ).toBe("Bài nguồn");
  });
  it("can choose basic mode while AI is configured without calling the vendor", async () => {
    let called = false;
    const service = new LessonAnalysisService(
      new SemanticLessonAnalysisProvider({
        id: "test",
        name: "test",
        async analyze() {
          called = true;
          return result;
        },
      }),
    );
    render(
      <LessonImportWizard
        active
        initialMode="paste"
        onClose={() => {}}
        service={service}
        aiConfigured
      />,
    );
    enter();
    fireEvent.click(screen.getByRole("button", { name: "Phân tích cơ bản" }));
    await screen.findByRole("heading", {
      name: "Đã phân tích kế hoạch bài dạy",
    });
    expect(called).toBe(false);
  });
  it("shows local setup and avoids claiming configured credentials are verified", () => {
    render(
      <AiSettings
        status={{
          providerId: "openai",
          model: "test-model",
          configured: true,
          status: "CONFIGURED",
        }}
        refresh={() => {}}
        close={() => {}}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "kết nối được xác nhận khi phân tích thành công",
    );
    expect(screen.getByRole("dialog").textContent).toContain(".env.local");
  });
});
