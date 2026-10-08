// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  periodAnalysis,
  confirmedSourceQuestion,
} from "./support/phase2g4Fixture";
import { confirmPeriods } from "../src/blueprint/periods";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import {
  createBlueprintDraft,
  approveBlueprint,
  editSlide,
} from "../src/blueprint/draft";
import { openIndexedStore } from "../src/storage/projects";
import { LessonGenerationService } from "../src/generation/service";
import { StudentPreview } from "../src/player/StudentPreview";
import { outcomeCatalog } from "../src/blueprint/model";
afterEach(cleanup);
async function generated() {
  const a = confirmPeriods(periodAnalysis(), ["p1", "p2"], 2, 35);
  a.assessments = [confirmedSourceQuestion()];
  const b = await new DeterministicLessonBlueprintProvider().generate(a);
  const draft = approveBlueprint(
    editSlide(createBlueprintDraft(b), b.proposedSlides[2].id, {
      title: "Bài thực hành giáo viên sửa",
    }),
    a,
  );
  const factory = new IDBFactory(),
    name = crypto.randomUUID();
  const store = await openIndexedStore(factory, name);
  const { project } = await new LessonGenerationService(store).generate(draft, {
    projectId: crypto.randomUUID(),
    now: new Date().toISOString(),
    outcomes: outcomeCatalog(a),
  });
  return { project, store, factory, name };
}
it("saves and reopens a schema 2.2 project with teacher edits, confirmed 70 minutes and source references", async () => {
  const { project, factory, name } = await generated();
  const restored = (await (await openIndexedStore(factory, name)).list())
    .projects[0];
  expect(restored).toEqual(project);
  expect(restored.metadata.durationMinutes).toBe(70);
  expect(restored.schemaVersion).toBe("2.2");
  expect(restored.slides[2].title).toBe("Bài thực hành giáo viên sửa");
  expect(restored.slides[2].sourceContext?.[0].blockId).toBe("b1");
  expect(restored.slides[2].teacherNotes).toContain("p1, p2");
});
it("hides correct-answer and feedback DOM until student submission", async () => {
  const { project } = await generated();
  const quiz = project.slides.find((s) => s.type === "quiz")!;
  render(<StudentPreview project={project} initialId={quiz.id} />);
  expect(screen.queryByText(/Đáp án đúng:/)).toBeNull();
  expect(screen.queryByText(confirmedSourceQuestion().feedback)).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: /Nháy chuột/ }));
  fireEvent.click(screen.getByRole("button", { name: "Nộp bài & chấm điểm" }));
  expect(screen.getByText(/Đáp án đúng:/)).toBeTruthy();
  expect(screen.getByText(confirmedSourceQuestion().feedback)).toBeTruthy();
});
