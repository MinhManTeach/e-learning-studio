import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openIndexedStore } from "../src/storage/projects";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { LessonGenerationService } from "../src/generation/service";
import { validateGeneratedLesson } from "../src/generation/validation";
import { learnerText, learnerGoal } from "../src/generation/language";
import { editorReducer, editorState } from "../src/editor/reducer";
import { consistencyWarnings } from "../src/model/analysis";
import { parseProject, type LessonProject } from "../src/model/schema";
import { generationFixture } from "./support/phase2cFixture";

describe("Phase 2C quality and persistence", () => {
  it("rejects invalid outcome links and duplicate question identities", async () => {
    const { b, context } = await generationFixture();
    const p = await new DeterministicLessonGenerationProvider().generate(
      b,
      context,
    );
    const quiz = p.slides.find((s) => s.type === "quiz")!;
    if (quiz.type === "quiz")
      quiz.data.questions.push(structuredClone(quiz.data.questions[0]));
    expect(
      validateGeneratedLesson(p, b, context).some(
        (w) => w.severity === "ERROR",
      ),
    ).toBe(true);
    if (quiz.type === "quiz") quiz.data.questions.pop();
    b.proposedSlides[0].sourceOutcomeIds = ["unknown-outcome"];
    expect(
      validateGeneratedLesson(p, b, context).some(
        (w) => w.code === "OUTCOME_REFERENCE",
      ),
    ).toBe(true);
  });
  it("blocks schema-valid content failures before storage", async () => {
    const { draft, context } = await generationFixture();
    const p = await new DeterministicLessonGenerationProvider().generate(
      draft.current,
      context,
    );
    p.slides[0].title = "";
    const save = vi.fn();
    const service = new LessonGenerationService(
      {
        list: async () => ({ projects: [], invalidCount: 0 }),
        save,
        remove: vi.fn(),
      },
      { generate: async () => p },
    );
    await expect(service.generate(draft, context)).rejects.toThrow(
      /chưa đạt kiểm tra/,
    );
    expect(save).not.toHaveBeenCalled();
  });
  it("balances repeated coverage and preserves explicit narration intent and AI responsibility", async () => {
    const { b, context } = await generationFixture();
    b.assessmentPlan.coverage = b.assessmentPlan.coverage.slice(0, 1);
    b.proposedSlides[0].narrationIntent = { enabled: false };
    const scenario = b.proposedSlides.find((s) => s.type === "SCENARIO")!;
    scenario.contentOutline = [
      "Con người chịu trách nhiệm với thông tin sử dụng từ Internet hoặc AI.",
    ];
    const p = await new DeterministicLessonGenerationProvider().generate(
      b,
      context,
    );
    expect(p.slides[0].narration.mode).toBe("NONE");
    const questions = p.slides.flatMap((s) =>
      s.type === "quiz" ? s.data.questions : [],
    );
    expect(new Set(questions.map((q) => q.level)).size).toBe(3);
    const generated = p.slides.find((s) =>
      s.id.endsWith(`:slide:${scenario.id}`),
    )!;
    expect(generated.type === "scenario" && generated.data.situation).toContain(
      "Internet hoặc AI",
    );
    expect(
      generated.type === "scenario" &&
        generated.data.choices.find((c) => c.isRecommended)?.text,
    ).toContain("chịu trách nhiệm");
  });
  it.each([
    [
      "TITLE",
      (p: LessonProject) => {
        p.slides[0].title = "";
      },
    ],
    [
      "EMPTY_CONTENT",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.type === "content")!;
        if (s.type === "content") {
          s.data.body = "";
          s.data.bulletPoints = [];
        }
      },
    ],
    [
      "SCHEMA",
      (p: LessonProject) => {
        p.slides[1].id = p.slides[0].id;
      },
    ],
    [
      "SCHEMA",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.type === "quiz")!;
        if (s.type === "quiz") s.data.questions[0].correctAnswerIndex = 99;
      },
    ],
    [
      "QUIZ",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.type === "quiz")!;
        if (s.type === "quiz") s.data.questions[0].explanation = "";
      },
    ],
    [
      "QUIZ",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.type === "quiz")!;
        if (s.type === "quiz") s.data.questions[0].points = 0;
      },
    ],
    [
      "SCENARIO",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.type === "scenario")!;
        if (s.type === "scenario") s.data.situation = "";
      },
    ],
    [
      "SCHEMA",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.type === "scenario")!;
        if (s.type === "scenario") s.data.choices = s.data.choices.slice(0, 1);
      },
    ],
    [
      "BROKEN_MEDIA",
      (p: LessonProject) => {
        const s = p.slides.find((s) => s.media.assetId)!;
        s.media.enabled = true;
      },
    ],
    [
      "COMPLETION",
      (p: LessonProject) => {
        p.slides.reverse();
      },
    ],
    [
      "DURATION",
      (p: LessonProject) => {
        p.metadata.durationMinutes = 90;
      },
    ],
  ])("detects %s in generated data", async (code, mutate) => {
    const { b, context } = await generationFixture();
    const p = await new DeterministicLessonGenerationProvider().generate(
      b,
      context,
    );
    mutate(p);
    expect(
      validateGeneratedLesson(p, b, context).some((w) => w.code === code),
    ).toBe(true);
  });
  it("rewrites teacher directions while preserving the learning action", () => {
    expect(learnerText("Giáo viên tổ chức cho học sinh quan sát tranh.")).toBe(
      "Em hãy quan sát tranh.",
    );
    expect(learnerText("HS so sánh các nguồn.")).toBe("Em so sánh các nguồn.");
    expect(learnerGoal("Học sinh nhận biết thông tin.")).toBe(
      "Nhận biết thông tin.",
    );
  });
  it("saves distinct identities, reloads IndexedDB and remains editable in Phase 1", async () => {
    const factory = new IDBFactory();
    const store = await openIndexedStore(factory, "phase2c");
    const { draft, context } = await generationFixture();
    const first = await new LessonGenerationService(store).generate(
      draft,
      context,
    );
    const second = await new LessonGenerationService(store).generate(draft, {
      ...context,
      projectId: "new-project",
    });
    expect(second.project.projectId).not.toBe(first.project.projectId);
    let state = editorState(first.project);
    state = editorReducer(state, {
      type: "edit",
      slide: { ...state.project.slides[0], title: "Giáo viên sửa" },
    });
    state = editorReducer(state, {
      type: "move",
      id: state.project.slides[2].id,
      direction: 1,
    });
    await store.save(parseProject(state.project));
    const reopened = await openIndexedStore(factory, "phase2c");
    const projects = (await reopened.list()).projects;
    expect(projects).toHaveLength(2);
    expect(projects.find((p) => p.projectId === context.projectId)).toEqual(
      state.project,
    );
  });
  it("does not overwrite an existing ID or save malformed provider output", async () => {
    const { draft, context } = await generationFixture();
    const p = await new DeterministicLessonGenerationProvider().generate(
      draft.current,
      context,
    );
    const save = vi.fn();
    const store = {
      list: async () => ({ projects: [p], invalidCount: 0 }),
      save,
      remove: vi.fn(),
    };
    await expect(
      new LessonGenerationService(store).generate(draft, context),
    ).rejects.toThrow(/đã tồn tại/);
    expect(save).not.toHaveBeenCalled();
    const provider = {
      generate: vi.fn(async () => ({
        ...p,
        slides: [{ ...p.slides[0], id: "" }],
      })),
    };
    const emptyStore = {
      ...store,
      list: async () => ({ projects: [], invalidCount: 0 }),
    };
    await expect(
      new LessonGenerationService(emptyStore, provider).generate(
        draft,
        context,
      ),
    ).rejects.toThrow(/Kịch bản hiện tại/);
    expect(save).not.toHaveBeenCalled();
  });
  it("reports real progress stages, honors passing score and preserves grade mismatch", async () => {
    const { b, context } = await generationFixture();
    b.assessmentPlan.targetPassingScore = 70;
    b.curriculumGrade = 4;
    b.targetAudienceGrade = 5;
    const stages: number[] = [];
    const p = await new DeterministicLessonGenerationProvider().generate(b, {
      ...context,
      onProgress: (n) => stages.push(n),
    });
    expect(stages).toEqual([0, 1, 2, 3, 4, 5]);
    expect(p.settings.passingScore).toBe(70);
    expect(consistencyWarnings(p)).toHaveLength(1);
    expect(new Set(p.slides.map((s) => s.type)).size).toBe(8);
    expect(
      p.slides.filter((s) => s.type === "warmup").every((s) => !s.data.scored),
    ).toBe(true);
  });
});
