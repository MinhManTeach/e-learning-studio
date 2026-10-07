import { describe, expect, it } from "vitest";
import { createProject, createSlide } from "../src/model/factories";
import { parseProject } from "../src/model/schema";
import { decodeProject, migrateLegacy } from "../src/model/migrations";
import { editorReducer, editorState } from "../src/editor/reducer";
import reference from "../reference/lesson_data.json";

describe("Project model and editor operations", () => {
  it("creates a valid project with two starter slides", () => {
    const p = createProject("Tin học lớp 4");
    expect(parseProject(p)).toEqual(p);
    expect(p.slides.map((s) => s.type)).toEqual(["welcome", "content"]);
    expect(p.metadata.projectTitle).toBe("Tin học lớp 4");
  });
  it("creates independent stable IDs", () => {
    const projects = Array.from({ length: 100 }, () => createProject());
    const ids = projects.flatMap((p) => [
      p.projectId,
      ...p.slides.map((s) => s.id),
    ]);
    expect(new Set(ids).size).toBe(300);
  });
  it("creates basic slide defaults", () => {
    expect(createSlide("content")).toMatchObject({
      type: "content",
      title: "Nội dung bài học",
      data: { body: "", bulletPoints: [] },
    });
  });
  it("adds and selects a slide without mutating original", () => {
    const before = editorState(createProject());
    const after = editorReducer(before, { type: "add", slideType: "content" });
    expect(before.project.slides).toHaveLength(2);
    expect(after.project.slides).toHaveLength(3);
    expect(after.selectedId).toBe(after.project.slides[2].id);
    expect(after.revision).toBe(1);
  });
  it("duplicates with a fresh ID and independent nested data", () => {
    const before = editorState(createProject());
    const after = editorReducer(before, {
      type: "duplicate",
      id: before.project.slides[0].id,
    });
    expect(after.project.slides).toHaveLength(3);
    expect(after.selectedId).toBe(after.project.slides[1].id);
    expect(after.project.slides[1].id).not.toBe(before.project.slides[0].id);
    expect(after.project.slides[1].data).not.toBe(
      before.project.slides[0].data,
    );
  });
  it("deletes selected slide and selects a neighbor", () => {
    const before = editorState(createProject());
    const after = editorReducer(before, {
      type: "delete",
      id: before.selectedId!,
    });
    expect(after.project.slides).toHaveLength(1);
    expect(after.selectedId).toBe(after.project.slides[0].id);
  });
  it("deletes the last selected slide and selects previous", () => {
    const p = createProject();
    const before = { ...editorState(p), selectedId: p.slides[1].id };
    expect(
      editorReducer(before, { type: "delete", id: before.selectedId })
        .selectedId,
    ).toBe(p.slides[0].id);
  });
  it("recovers a zero-slide project by adding", () => {
    const p = createProject();
    p.slides = [];
    const before = editorState(parseProject(p));
    expect(before.selectedId).toBeNull();
    expect(
      editorReducer(before, { type: "add", slideType: "welcome" }).project
        .slides,
    ).toHaveLength(1);
  });
  it("moves slides in both directions preserving IDs and selected slide", () => {
    const before = editorState(createProject());
    const down = editorReducer(before, {
      type: "move",
      id: before.selectedId!,
      direction: 1,
    });
    expect(down.project.slides[1].id).toBe(before.selectedId);
    expect(down.selectedId).toBe(before.selectedId);
    expect(
      editorReducer(down, {
        type: "move",
        id: before.selectedId!,
        direction: -1,
      }).project.slides,
    ).toEqual(before.project.slides);
  });
  it("ignores reorder boundaries and unknown IDs", () => {
    const before = editorState(createProject());
    expect(
      editorReducer(before, {
        type: "move",
        id: before.selectedId!,
        direction: -1,
      }),
    ).toBe(before);
    expect(
      editorReducer(before, { type: "move", id: "missing", direction: 1 }),
    ).toBe(before);
    expect(editorReducer(before, { type: "duplicate", id: "missing" })).toBe(
      before,
    );
    expect(editorReducer(before, { type: "delete", id: "missing" })).toBe(
      before,
    );
  });
  it("edits slide text and preserves plain HTML as text", () => {
    const before = editorState(createProject());
    const slide = {
      ...before.project.slides[0],
      title: '<img onerror="alert(1)">',
    };
    const after = editorReducer(before, { type: "edit", slide });
    expect(after.project.slides[0].title).toBe(slide.title);
    expect(before.project.slides[0].title).toBe("Trang mở đầu");
  });
  it("edits metadata and learning objectives", () => {
    const before = editorState(createProject());
    const metadata = {
      ...before.project.metadata,
      subject: "Tin học",
      objectives: {
        knowledge: ["Kiến thức"],
        competencies: ["Năng lực"],
        qualities: ["Phẩm chất"],
      },
    };
    expect(
      editorReducer(before, { type: "metadata", metadata }).project.metadata,
    ).toEqual(metadata);
  });
  it("selection does not mark content dirty", () => {
    const state = editorState(createProject());
    expect(editorReducer(state, { type: "select", id: null }).revision).toBe(0);
  });
  it("rejects duplicate slide IDs", () => {
    const p = createProject();
    p.slides[1].id = p.slides[0].id;
    expect(() => parseProject(p)).toThrow();
  });
  it.each([
    null,
    {},
    { schemaVersion: "3.0" },
    { schemaVersion: "2.0", projectId: "" },
  ])("rejects invalid project %j", (value) => {
    expect(() => decodeProject(value)).toThrow();
  });
  it("rejects unknown slide types", () => {
    const p = createProject();
    expect(() =>
      parseProject({ ...p, slides: [{ ...p.slides[0], type: "unsafe" }] }),
    ).toThrow();
  });
  it("fills missing safe default fields", () => {
    const p = createProject();
    const parsed = parseProject({
      ...p,
      metadata: {},
      slides: [{ id: "slide", type: "content", data: {} }],
    });
    expect(parsed.slides[0].title).toBe("Trang chưa đặt tên");
  });
  it("migrates all 14 reference slides and preserves unsupported activity payloads", () => {
    const p = migrateLegacy(reference);
    expect(p.slides).toHaveLength(14);
    expect(p.metadata.objectives.knowledge).toEqual(
      reference.metadata.objectives.knowledge,
    );
    const quiz = p.slides.find(
      (s) => s.type === "legacy" && s.data.originalType === "quiz",
    );
    expect(quiz?.type === "legacy" && quiz.data.original.quizData).toEqual(
      reference.slides.find((s) => s.type === "quiz")?.quizData,
    );
    expect(p.legacySource).toEqual(reference);
    expect(p.metadata.aiIntegration).toBe(
      reference.metadata.objectives.aiIntegration,
    );
  });
  it("dispatches current schema without changing project identity", () => {
    const p = createProject();
    expect(decodeProject(p)).toEqual(p);
  });
});
