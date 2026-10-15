import { afterEach, expect, it, vi } from "vitest";
import { createProject } from "../src/model/factories";
import { editorReducer, editorState } from "../src/editor/reducer";
import { packSteps } from "../src/renderers/EditableSlide";
import type { Slide, SlideItem } from "../src/model/schema";

afterEach(() => vi.useRealTimers());

const titled = (slide: Slide, title: string): Slide => ({ ...slide, title });

it("takes back and redoes changes, showing the page that changed", () => {
  let s = editorState(createProject());
  s = editorReducer(s, { type: "add", slideType: "content" });
  s = editorReducer(s, { type: "add", slideType: "content" });
  const [, second] = s.project.slides.slice(-2);
  s = editorReducer(s, { type: "select", id: s.project.slides[0].id });
  vi.useFakeTimers();
  s = editorReducer(s, { type: "edit", slide: titled(second, "Mới") });
  const edited = s.project;
  s = editorReducer(s, { type: "select", id: s.project.slides[0].id });
  s = editorReducer(s, { type: "undo" });
  expect(s.project.slides.find((x) => x.id === second.id)!.title).toBe(
    second.title,
  );
  expect(s.selectedId).toBe(second.id);
  s = editorReducer(s, { type: "redo" });
  expect(s.project).toBe(edited);
  // A new change after an undo drops what was undone.
  s = editorReducer(s, { type: "undo" });
  s = editorReducer(s, { type: "add", slideType: "content" });
  expect(s.future).toEqual([]);
  expect(editorReducer(s, { type: "redo" })).toBe(s);
});

it("undoes quick typing on one page as one step, and selecting as none", () => {
  vi.useFakeTimers();
  let s = editorState(createProject());
  s = editorReducer(s, { type: "add", slideType: "content" });
  const slide = s.project.slides.at(-1)!;
  const start = s.project;
  for (const title of ["T", "Th", "Thơ"]) {
    vi.advanceTimersByTime(200);
    s = editorReducer(s, { type: "edit", slide: titled(slide, title) });
  }
  s = editorReducer(s, { type: "select", id: null });
  s = editorReducer(s, { type: "undo" });
  expect(s.project).toBe(start);
  // After a pause the next edit is its own step.
  s = editorReducer(s, { type: "redo" });
  vi.advanceTimersByTime(2000);
  s = editorReducer(s, { type: "edit", slide: titled(slide, "Thơ hay") });
  s = editorReducer(s, { type: "undo" });
  expect(s.project.slides.at(-1)!.title).toBe("Thơ");
});

it("keeps click numbers 1, 2, 3 without gaps", () => {
  const item = (id: string, step?: number): SlideItem => ({
    id,
    kind: "TEXT",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    text: [],
    ...(step ? { step } : {}),
  });
  expect(
    packSteps([item("a", 4), item("b"), item("c", 2), item("d", 4)]).map(
      (i) => i.step,
    ),
  ).toEqual([2, undefined, 1, 2]);
});
