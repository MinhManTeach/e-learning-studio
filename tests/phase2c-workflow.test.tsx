// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { LessonImportWizard } from "../src/import/LessonImportWizard";
import { Editor } from "../src/editor/Editor";
import { generationFixture } from "./support/phase2cFixture";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { LessonGenerationService } from "../src/generation/service";
import {
  createSession,
  sessionReducer,
  deriveCompletionState,
  aggregateQuiz,
  progress,
} from "../src/player/session";
afterEach(cleanup);
it("opens the saved generated project through both existing editor and preview actions", async () => {
  const save = vi.fn();
  const open = vi.fn();
  const store = {
    list: async () => ({ projects: [], invalidCount: 0 }),
    save,
    remove: vi.fn(),
  };
  render(
    <LessonImportWizard
      active
      initialMode="paste"
      onClose={() => {}}
      store={store}
      openGenerated={open}
    />,
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
    {
      target: {
        value: readFileSync("src/fixtures/lesson-plan-vi.txt", "utf8"),
      },
    },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
  );
  await screen.findByRole("heading", { name: "Đã phân tích kế hoạch bài dạy" });
  fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã kiểm tra/ }));
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận & tiếp tục" }));
  await screen.findByRole("heading", { name: "Đề xuất kịch bản bài giảng" });
  expect(
    (screen.getByRole("button", { name: "Tạo bài giảng" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Duyệt kịch bản" }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo bài giảng" }));
  expect(
    screen.getByRole("progressbar", { name: "Tiến độ tạo bài giảng" }),
  ).toBeTruthy();
  await screen.findByRole("heading", { name: "Bài giảng đã được tạo" });
  expect(save).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Mở bài giảng" }));
  expect(open).toHaveBeenLastCalledWith(save.mock.calls[0][0], false);
  fireEvent.click(
    screen.getByRole("button", { name: "Xem trước với vai trò học sinh" }),
  );
  expect(open).toHaveBeenLastCalledWith(save.mock.calls[0][0], true);
});
it("retains the approved draft and permits retry after storage failure", async () => {
  const { draft, context } = await generationFixture();
  const original = structuredClone(draft);
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("disk"))
    .mockResolvedValue(undefined);
  const service = new LessonGenerationService({
    list: async () => ({ projects: [], invalidCount: 0 }),
    save,
    remove: vi.fn(),
  });
  await expect(service.generate(draft, context)).rejects.toThrow(
    /vẫn được giữ/,
  );
  expect(draft).toEqual(original);
  expect((await service.generate(draft, context)).project.projectId).toBe(
    context.projectId,
  );
  expect(save).toHaveBeenCalledTimes(2);
});
it("runs generated formative interactions and scored assessment to passed completion", async () => {
  const { b, context } = await generationFixture();
  const p = await new DeterministicLessonGenerationProvider().generate(
    b,
    context,
  );
  let session = createSession(p, null);
  expect(deriveCompletionState(p, session)).toBe("IN_PROGRESS");
  for (const s of p.slides) {
    session = sessionReducer(p, session, { type: "visit", id: s.id });
    if (s.type === "warmup")
      session = sessionReducer(p, session, {
        type: "warmup",
        id: s.id,
        itemId: s.data.items[0].id,
      });
    if (s.type === "scenario")
      session = sessionReducer(p, session, {
        type: "scenario",
        id: s.id,
        choiceId: s.data.choices.find((c) => c.isRecommended)!.id,
      });
    if (s.type === "quiz") {
      for (const q of s.data.questions)
        session = sessionReducer(p, session, {
          type: "answer",
          id: s.id,
          questionId: q.id,
          optionId: q.options[q.correctAnswerIndex].id,
        });
      session = sessionReducer(p, session, { type: "submit", id: s.id });
    }
  }
  expect(progress(p, session)).toBe(100);
  expect(aggregateQuiz(p, session).score).toBe(100);
  expect(deriveCompletionState(p, session)).toBe("PASSED");
  render(
    <Editor
      project={p}
      store={{
        list: async () => ({ projects: [p], invalidCount: 0 }),
        save: vi.fn(),
        remove: vi.fn(),
      }}
      back={() => {}}
      initialPreview
    />,
  );
  expect(
    screen.getAllByRole("heading", { name: p.slides[0].title }).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText(/Mục đích:.*Yêu cầu nguồn/)).toBeNull();
});
