// Undo and redo page by page in the editor.
import { expect, it, vi } from "vitest";
import {
  canRedo,
  canUndo,
  editorReducer,
  editorState,
  historyLimit,
  type EditorState,
} from "../src/editor/reducer";
import { createProject, createSlide } from "../src/model/factories";
import type { Slide } from "../src/model/schema";

function start() {
  const a = { ...createSlide("content"), title: "Trang A" };
  const b = { ...createSlide("content"), title: "Trang B" };
  const project = { ...createProject("Bài"), slides: [a, b] };
  return editorState(project);
}
const titled = (state: EditorState, i: number, title: string): Slide => ({
  ...state.project.slides[i],
  title,
});
const titles = (state: EditorState) => state.project.slides.map((s) => s.title);

it("undoes and redoes the changes of one page, not the others", () => {
  vi.useFakeTimers();
  let s = start();
  const [a, b] = s.project.slides.map((x) => x.id);
  expect(canUndo(s, a)).toBe(false);
  s = editorReducer(s, { type: "edit", slide: titled(s, 0, "A1") });
  vi.advanceTimersByTime(2000);
  s = editorReducer(s, { type: "edit", slide: titled(s, 1, "B1") });
  vi.advanceTimersByTime(2000);
  s = editorReducer(s, { type: "edit", slide: titled(s, 0, "A2") });
  s = editorReducer(s, { type: "undo", id: a });
  expect(titles(s)).toEqual(["A1", "B1"]);
  s = editorReducer(s, { type: "undo", id: a });
  expect(titles(s)).toEqual(["Trang A", "B1"]);
  expect(canUndo(s, a)).toBe(false);
  expect(canUndo(s, b)).toBe(true);
  s = editorReducer(s, { type: "redo", id: a });
  expect(titles(s)).toEqual(["A1", "B1"]);
  // A new change drops what was undone.
  s = editorReducer(s, { type: "edit", slide: titled(s, 0, "A3") });
  expect(canRedo(s, a)).toBe(false);
  vi.useRealTimers();
});

it("undoes a burst of typing in one step", () => {
  vi.useFakeTimers();
  let s = start();
  const a = s.project.slides[0].id;
  for (const t of ["T", "Ti", "Tiê", "Tiêu"]) {
    s = editorReducer(s, { type: "edit", slide: titled(s, 0, t) });
    vi.advanceTimersByTime(100);
  }
  s = editorReducer(s, { type: "undo", id: a });
  expect(titles(s)[0]).toBe("Trang A");
  vi.useRealTimers();
});

it("undoes a page changed by AI on that page alone", () => {
  let s = start();
  const a = s.project.slides[0].id;
  const changed = {
    ...s.project,
    slides: [titled(s, 0, "AI viết lại"), s.project.slides[1]],
  };
  s = editorReducer(s, { type: "ai", project: changed });
  expect(canUndo(s, s.project.slides[1].id)).toBe(false);
  s = editorReducer(s, { type: "undo", id: a });
  expect(titles(s)).toEqual(["Trang A", "Trang B"]);
});

it(`keeps at most ${historyLimit} versions of a page`, () => {
  vi.useFakeTimers();
  let s = start();
  const a = s.project.slides[0].id;
  for (let i = 0; i < historyLimit + 10; i++) {
    s = editorReducer(s, { type: "edit", slide: titled(s, 0, `v${i}`) });
    vi.advanceTimersByTime(1000);
  }
  expect(s.history?.[a].past).toHaveLength(historyLimit);
  vi.useRealTimers();
});
