// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Editor } from "../src/editor/Editor";
import { createProject } from "../src/model/factories";
import type { LessonProject } from "../src/model/schema";
import {
  ProjectConflictError,
  type SaveOptions,
} from "../src/storage/projects";

afterEach(cleanup);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("Editor save and navigation", () => {
  it("returns to the dashboard after an in-flight save finishes", async () => {
    const pending = deferred();
    const save = vi.fn((_: LessonProject) => pending.promise);
    const back = vi.fn();
    render(
      <Editor
        project={createProject("Bài thử")}
        store={{
          list: async () => ({ projects: [], invalidCount: 0 }),
          save,
          remove: vi.fn(),
        }}
        back={back}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề" }), {
      target: { value: "Tiêu đề mới" },
    });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(save).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Bài giảng của tôi" })[0],
    );
    expect(back).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(back).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });
});

describe("Editor conflict handling", () => {
  function setup() {
    const project = createProject("Bài thử");
    const save = vi.fn(async (_: LessonProject, options?: SaveOptions) => {
      if (options?.expectedUpdatedAt) throw new ProjectConflictError();
    });
    const back = vi.fn();
    render(
      <Editor
        project={project}
        store={{
          list: async () => ({ projects: [], invalidCount: 0 }),
          save,
          remove: vi.fn(),
        }}
        back={back}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề" }), {
      target: { value: "Tiêu đề mới" },
    });
    return { project, save, back };
  }
  it("sends the loaded baseline and explains a conflict instead of overwriting", async () => {
    const { project, save } = setup();
    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    });
    expect(save.mock.calls[0][1]).toEqual({
      expectedUpdatedAt: project.updatedAt,
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "vừa được lưu ở cửa sổ khác",
    );
  });
  it("lets the teacher overwrite deliberately or discard and leave", async () => {
    const { save, back } = setup();
    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Ghi đè bằng bản đang sửa" }),
      );
    });
    expect(save.mock.calls.at(-1)?.[1]).toBeUndefined();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề" }), {
      target: { value: "Sửa tiếp" },
    });
    save.mockRejectedValueOnce(new ProjectConflictError());
    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Bỏ thay đổi, về danh sách" }),
    );
    expect(back).toHaveBeenCalledOnce();
  });
});
