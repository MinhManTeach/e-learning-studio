import { generationFixture } from "./support/phase2cFixture";
import { describe, expect, it, vi } from "vitest";
import {
  approveBlueprint,
  editSlide,
  moveSlide,
  addSlide,
  deleteSlide,
} from "../src/blueprint/draft";
import { parseProject } from "../src/model/schema";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { LessonGenerationService } from "../src/generation/service";
import { validateGeneratedLesson } from "../src/generation/validation";
import { calculateQuizScore } from "../src/player/session";

describe("Phase 2C approved blueprint generation", () => {
  it("requires approval and validates before saving", async () => {
    const { draft, context } = await generationFixture();
    const store = {
      list: async () => ({ projects: [], invalidCount: 0 }),
      save: vi.fn(),
      remove: vi.fn(),
    };
    const service = new LessonGenerationService(store);
    await expect(
      service.generate({ ...draft, approvedAt: null }, context),
    ).rejects.toThrow(/duyệt/);
    expect(store.save).not.toHaveBeenCalled();
  });
  it("produces stable canonical 2.2 data without network calls", async () => {
    const { b, context } = await generationFixture();
    const provider = new DeterministicLessonGenerationProvider();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const project = await provider.generate(b, context);
    expect(await provider.generate(b, context)).toEqual(project);
    expect(parseProject(project)).toEqual(project);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(project.metadata.projectTitle).toBe(b.title);
    expect(project.metadata.durationMinutes).toBe(35);
    expect(project.objectives.curriculumOutcomes).toEqual(
      context.outcomes.map((o) => o.text),
    );
    expect(project.slides.map((s) => s.type)).toEqual(
      b.proposedSlides.map((s) => s.type.toLowerCase()),
    );
  });
  it("uses all current edits, including title, order, media, deletion and addition", async () => {
    const { a, draft, context } = await generationFixture();
    let edited = editSlide(draft, draft.current.proposedSlides[2].id, {
      title: "Quan sát nguồn tin",
      mediaIntent: {
        type: "IMAGE",
        purpose: "Đối chiếu nguồn",
        visualDescription: "Hai nguồn khác nhau",
        searchQuery: "children compare sources",
        required: true,
      },
    });
    edited = moveSlide(edited, edited.current.proposedSlides[2].id, 3);
    edited = deleteSlide(edited, edited.current.proposedSlides[4].id);
    edited = addSlide(edited);
    edited.current.title = "Bài đã duyệt";
    edited = approveBlueprint(edited, a);
    const p = await new DeterministicLessonGenerationProvider().generate(
      edited.current,
      context,
    );
    expect(p.metadata.projectTitle).toBe("Bài đã duyệt");
    expect(p.slides.map((s) => s.title)).toEqual(
      edited.current.proposedSlides.map((s) => s.title),
    );
    expect(p.slides[3].media.suggestion).toContain("children compare sources");
    expect(p.slides.length).toBe(edited.current.proposedSlides.length);
  });
  it("creates real questions with feedback, weights, coverage and varied correct positions", async () => {
    const { b, context } = await generationFixture();
    const p = await new DeterministicLessonGenerationProvider().generate(
      b,
      context,
    );
    const quizzes = p.slides.filter((s) => s.type === "quiz");
    const questions = quizzes.flatMap((s) => s.data.questions);
    expect(questions.length).toBe(b.assessmentPlan.targetQuestionCount);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(
      new Set(questions.map((q) => q.correctAnswerIndex)).size,
    ).toBeGreaterThan(1);
    for (const quiz of quizzes) {
      expect(quiz.data.passingScore).toBe(80);
      const answers = Object.fromEntries(
        quiz.data.questions.map((q) => [
          q.id,
          q.options[q.correctAnswerIndex].id,
        ]),
      );
      expect(calculateQuizScore(quiz.data, answers).score).toBe(100);
    }
    for (const q of questions) {
      expect(q.explanation.length).toBeGreaterThan(15);
      expect(q.points).toBeGreaterThan(0);
      expect(q.options[q.correctAnswerIndex]).toBeTruthy();
      expect(q.prompt).not.toContain("đã hiểu bài chưa");
    }
    expect(
      validateGeneratedLesson(p, b, context).filter(
        (w) => w.severity === "ERROR",
      ),
    ).toEqual([]);
  });
  it("preserves unresolved media without broken images and creates distinct narration", async () => {
    const { b, context } = await generationFixture();
    const p = await new DeterministicLessonGenerationProvider().generate(
      b,
      context,
    );
    b.proposedSlides.forEach((s, i) => {
      expect(p.slides[i].media.enabled).toBe(false);
      expect(p.slides[i].voiceScript.length).toBeGreaterThan(10);
      if (s.mediaIntent?.type !== "NONE" && s.mediaIntent) {
        expect(p.slides[i].media.suggestion).toContain(s.mediaIntent.purpose);
        expect(p.slides[i].media.suggestion).toContain(
          s.mediaIntent.visualDescription ?? "",
        );
      }
    });
    expect(
      validateGeneratedLesson(p, b, context).some(
        (w) => w.code === "UNRESOLVED_MEDIA" && w.severity === "WARNING",
      ),
    ).toBe(true);
  });
  it("locks concurrent requests and returns the existing generated result on repeat", async () => {
    const { draft, context } = await generationFixture();
    const store = {
      list: async () => ({ projects: [], invalidCount: 0 }),
      save: vi.fn(),
      remove: vi.fn(),
    };
    const service = new LessonGenerationService(store);
    const [first, second] = await Promise.all([
      service.generate(draft, context),
      service.generate(draft, context),
    ]);
    expect(second).toEqual(first);
    expect(
      await service.generate(draft, { ...context, projectId: "different" }),
    ).toEqual(first);
    expect(store.save).toHaveBeenCalledOnce();
  });
});
