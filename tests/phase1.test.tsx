import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createProject, createSlide } from "../src/model/factories";
import { createProject as create21 } from "../src/model/factoriesV21";
import { migrateV21, decodeProject } from "../src/model/migrations";
import { parseProject, slideSchema, layouts } from "../src/model/schema";
import {
  availableSlideTypes,
  slideRegistry,
  futureSlideTypes,
} from "../src/slides/registry";
import {
  analyzeSlideDensity,
  consistencyWarnings,
  effectiveLayout,
} from "../src/model/analysis";
import { exportProjectJSON, importProjectJSON } from "../src/model/json";
import { createSampleProject } from "../src/fixtures/sampleLesson";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import {
  calculateQuizScore,
  createSession,
  sessionReducer,
  progress,
  canRetry,
  deriveCompletionState,
  aggregateQuiz,
  orderedQuestions,
  orderedOptions,
} from "../src/player/session";
import { editorReducer, editorState } from "../src/editor/reducer";
function quizProject() {
  const p = createProject();
  const slide = createSlide("quiz");
  const q = slide.data.questions[0];
  q.points = 30;
  const other = structuredClone(q);
  other.id = "q-other";
  other.points = 70;
  other.options = other.options.map((o) => ({ ...o, id: o.id + "-other" }));
  slide.data.questions.push(other);
  p.slides = [slide];
  p.settings.requireAllSlides = false;
  return { p, slide };
}
describe("Canonical 2.2 architecture", () => {
  it("creates schema 2.2 with independent grades, pedagogy, narration and assets", () => {
    const p = createProject();
    expect(p.schemaVersion).toBe("2.2");
    expect(p.pedagogy.model).toBe("STUDIO");
    expect(parseProject(p)).toEqual(p);
    expect(p.slides[0].narration.mode).toBe("BROWSER_TTS");
  });
  it.each(availableSlideTypes)(
    "validates default %s and unique factories",
    (type) => {
      const a = createSlide(type),
        b = slideRegistry[type].defaultFactory();
      expect(slideSchema.parse(a)).toEqual(a);
      expect(a.id).not.toBe(b.id);
    },
  );
  it("prepares future types without presenting them as supported", () => {
    expect(futureSlideTypes).toContain("certificate");
    expect(availableSlideTypes).not.toContain("certificate");
  });
  it("migrates 2.1 deterministically preserving identity, order, sources and images", () => {
    const old = create21();
    old.metadata.grade = "4";
    if (old.slides[0].type === "legacy")
      throw new Error("Expected basic slide");
    old.slides[0].notes = "Private teacher notes";
    old.slides[0].data.imageUrl = "https://example.com/a.png";
    old.slides[0].data.imageCaption = "Ảnh minh họa";
    old.legacySource = { custom: "kept" };
    old.migrationSource = { older: "kept" };
    const a = migrateV21(old),
      b = migrateV21(old);
    expect(a).toEqual(b);
    expect(a.projectId).toBe(old.projectId);
    expect(a.createdAt).toBe(old.createdAt);
    expect(a.updatedAt).toBe(old.updatedAt);
    expect(a.slides.map((s) => s.id)).toEqual(old.slides.map((s) => s.id));
    expect(a.legacySource).toEqual(old.legacySource);
    expect(a.migrationSource).toEqual(old.migrationSource);
    expect(a.slides[0].teacherNotes).toBe("Private teacher notes");
    expect(a.assets.find((x) => x.id === a.slides[0].media.assetId)?.url).toBe(
      "https://example.com/a.png",
    );
    expect(a.metadata.curriculumGrade).toBe("4");
    expect(a.metadata.targetAudienceGrade).toBe("4");
  });
  it("keeps unsupported legacy payload unchanged", () => {
    const old = create21();
    old.slides = [
      {
        id: "legacy",
        type: "legacy",
        title: "Legacy",
        subtitle: "",
        stepNumber: 1,
        stepName: "",
        voiceScript: "",
        notes: "note",
        data: {
          originalType: "hotspot",
          original: { arbitrary: { nested: [1, 2, 3] } },
        },
      },
    ];
    expect(migrateV21(old).slides[0].data).toEqual(old.slides[0].data);
  });
  it("warns about grade mismatch without overwriting either grade", () => {
    const p = createSampleProject();
    expect(consistencyWarnings(p)[0].code).toBe("GRADE_MISMATCH");
    expect(p.metadata.curriculumGrade).toBe("4");
    expect(p.metadata.targetAudienceGrade).toBe("5");
    p.metadata.targetAudienceGrade = "4";
    expect(consistencyWarnings(p)).toEqual([]);
  });
  it.each(layouts)("uses %s layout and degrades without media", (layout) => {
    const s = createSlide("content");
    s.layout = layout;
    s.media.enabled = true;
    expect(effectiveLayout(s, true)).toBe(layout);
    s.media.enabled = false;
    expect(effectiveLayout(s, true)).toBe(
      layout === "CENTERED" ? "CENTERED" : "TEXT_ONLY",
    );
  });
  it("renders no media column, figure or broken image when media is disabled", () => {
    const p = createProject();
    const s = createSlide("content");
    s.data.body = "Full width content";
    s.layout = "TEXT_LEFT_MEDIA_RIGHT";
    s.media = { ...s.media, enabled: false, assetId: "image" };
    p.assets = [
      {
        id: "image",
        kind: "IMAGE",
        sourceType: "URL",
        name: "",
        fileName: "",
        mimeType: "",
        url: "https://example.com/a.png",
        altText: "alt",
        status: "EXTERNAL",
      },
    ];
    p.slides = [s];
    const markup = renderToStaticMarkup(<SlideCanvas slide={s} project={p} />);
    expect(markup).toContain("layout-TEXT_ONLY");
    expect(markup).not.toContain("layout-media");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("<figure");
    expect(markup).toContain("Full width content");
  });
  it("keeps disabled media disabled when only its alt text changes", () => {
    let state = editorState(createProject());
    const id = state.project.slides[0].id;
    state = editorReducer(state, {
      type: "media",
      id,
      url: "https://example.com/image.png",
      alt: "Old",
    });
    state = editorReducer(state, {
      type: "edit",
      slide: {
        ...state.project.slides[0],
        media: { ...state.project.slides[0].media, enabled: false },
      },
    });
    state = editorReducer(state, {
      type: "media",
      id,
      url: "https://example.com/image.png",
      alt: "New",
    });
    expect(state.project.slides[0].media.enabled).toBe(false);
    expect(state.project.assets[0].altText).toBe("New");
  });
  it("uses alt text and fails unsafe external URLs gracefully", () => {
    const p = createProject();
    const s = p.slides[1];
    s.media = { ...s.media, enabled: true, assetId: "image" };
    s.layout = "MEDIA_LEFT_TEXT_RIGHT";
    p.assets = [
      {
        id: "image",
        kind: "IMAGE",
        sourceType: "URL",
        name: "",
        fileName: "",
        mimeType: "",
        url: "https://example.com/a.png",
        altText: "Mô tả ý nghĩa",
        status: "EXTERNAL",
      },
    ];
    expect(
      renderToStaticMarkup(<SlideCanvas slide={s} project={p} />),
    ).toContain('alt="Mô tả ý nghĩa"');
    p.assets[0].url = "javascript:alert(1)";
    const text = renderToStaticMarkup(<SlideCanvas slide={s} project={p} />);
    expect(text).not.toContain("<img");
    expect(text).toContain("Không tải được hình ảnh");
  });
  it("centralizes density warnings and leaves content unchanged", () => {
    const s = createSlide("content");
    s.title = "x".repeat(120);
    s.subtitle = "x".repeat(200);
    s.data.bulletPoints = Array(9).fill("Item");
    s.data.body = "x".repeat(1600);
    s.voiceScript = "x".repeat(2000);
    const before = structuredClone(s);
    expect(analyzeSlideDensity(s).map((x) => x.code)).toEqual([
      "TITLE",
      "SUBTITLE",
      "BULLETS",
      "CONTENT",
      "VOICE",
    ]);
    expect(s).toEqual(before);
    expect(analyzeSlideDensity(createSlide("content"))).toEqual([]);
  });
  it.each(["SAFE_TEAL", "NAVY", "FOCUS_DARK"] as const)(
    "shares %s theme between any renderer",
    (theme) => {
      const p = createProject();
      p.settings.theme = theme;
      expect(
        renderToStaticMarkup(<SlideCanvas slide={p.slides[0]} project={p} />),
      ).toContain(`data-theme="${theme}"`);
    },
  );
  it("keeps teacher notes and raw HTML out of student markup", () => {
    const p = createProject();
    p.slides[0].teacherNotes = "SECRET TEACHER NOTE";
    p.slides[0].title = "<img src=x onerror=alert(1)>";
    const html = renderToStaticMarkup(
      <SlideCanvas slide={p.slides[0]} project={p} />,
    );
    expect(html).not.toContain("SECRET TEACHER NOTE");
    expect(html).toContain("&lt;img");
  });
  it("exports edited canonical data, including removed images and added slides, not source", () => {
    const p = createSampleProject();
    p.legacySource = { title: "DO NOT REBUILD" };
    p.slides[0].media.enabled = false;
    p.slides[0].title = "Teacher final edit";
    p.slides.push(createSlide("summary"));
    const restored = importProjectJSON(exportProjectJSON(p));
    expect(restored).toEqual(p);
    expect(restored.slides[0].title).toBe("Teacher final edit");
    expect(restored.slides[0].media.enabled).toBe(false);
  });
  it("rejects runtime fields from canonical export", () => {
    const p = createProject();
    const data = JSON.parse(exportProjectJSON({ ...p, ...createSession(p) }));
    expect(data).not.toHaveProperty("currentSlideId");
    expect(data).not.toHaveProperty("visitedSlideIds");
    expect(data).not.toHaveProperty("quizAttempts");
  });
  it("rejects invalid JSON, unknown version and missing canonical identity", () => {
    expect(() => importProjectJSON("{")).toThrow();
    expect(() => decodeProject({ schemaVersion: "9" })).toThrow();
    expect(() => parseProject({ ...createProject(), projectId: "" })).toThrow();
  });
  it("clones a shared image reference on editing a duplicated slide", () => {
    let state = editorState(createProject());
    state = editorReducer(state, {
      type: "media",
      id: state.selectedId!,
      url: "https://example.com/original",
      alt: "original",
    });
    const original = state.selectedId!;
    state = editorReducer(state, { type: "duplicate", id: original });
    state = editorReducer(state, {
      type: "media",
      id: state.selectedId!,
      url: "https://example.com/copy",
      alt: "copy",
    });
    expect(state.project.assets).toHaveLength(2);
    expect(state.project.slides[0].media.assetId).not.toBe(
      state.project.slides[1].media.assetId,
    );
  });
  it("supports 50 slides and 100 questions with valid round-trip", () => {
    const p = createProject();
    p.slides = Array.from({ length: 49 }, () => createSlide("content"));
    const q = createSlide("quiz");
    q.data.questions = Array.from({ length: 100 }, (_, i) => ({
      ...structuredClone(q.data.questions[0]),
      id: "question-" + i,
    }));
    p.slides.push(q);
    expect(importProjectJSON(exportProjectJSON(p))).toEqual(p);
  });
});
describe("Scenario, quiz and completion runtime", () => {
  it("provides four fixture choices with B recommended and formative feedback", () => {
    const s = createSampleProject().slides[8];
    expect(s.type).toBe("scenario");
    if (s.type === "scenario") {
      expect(s.data.choices).toHaveLength(4);
      expect(s.data.choices.find((c) => c.isRecommended)?.label).toBe("B");
      expect(s.data.choices.every((c) => c.feedback && c.consequence)).toBe(
        true,
      );
    }
  });
  it("supports scenario retry, respects settings and never enters quiz score", () => {
    const p = createProject();
    const s = createSlide("scenario");
    p.slides = [s];
    let state = createSession(p);
    state = sessionReducer(p, state, {
      type: "scenario",
      id: s.id,
      choiceId: s.data.choices[1].id,
    });
    const selected = state;
    expect(state.interactions[s.id].choiceId).toBe(s.data.choices[1].id);
    state = sessionReducer(p, state, { type: "scenarioRetry", id: s.id });
    expect(state.interactions[s.id].choiceId).toBeUndefined();
    p.settings.allowRetry = false;
    expect(
      sessionReducer(p, selected, { type: "scenarioRetry", id: s.id }),
    ).toEqual(selected);
    expect(aggregateQuiz(p, selected).hasQuiz).toBe(false);
  });
  it("resets warmup and interactions when starting a new preview session", () => {
    const p = createSampleProject();
    const s = p.slides[2];
    if (s.type !== "warmup") throw Error();
    let state = createSession(p);
    state = sessionReducer(p, state, {
      type: "warmup",
      id: s.id,
      itemId: s.data.items[0].id,
    });
    expect(state.interactions[s.id].selectedIds).toHaveLength(1);
    expect(createSession(p).interactions).toEqual({});
  });
  it("calculates weighted scores instead of counting questions", () => {
    const { slide } = quizProject();
    const q = slide.data.questions;
    expect(
      calculateQuizScore(slide.data, { [q[1].id]: q[1].options[0].id }),
    ).toMatchObject({
      score: 70,
      earnedPoints: 70,
      availablePoints: 100,
      passed: false,
    });
  });
  it("normalizes scores and passing threshold, unanswered questions earn zero", () => {
    const { slide } = quizProject();
    const answers = Object.fromEntries(
      slide.data.questions.map((q) => [q.id, q.options[0].id]),
    );
    expect(calculateQuizScore(slide.data, answers)).toMatchObject({
      score: 100,
      passed: true,
    });
    expect(calculateQuizScore(slide.data, {}).score).toBe(0);
  });
  it("handles zero questions and zero points without granting pass", () => {
    const { slide } = quizProject();
    slide.data.questions = [];
    expect(calculateQuizScore(slide.data, {})).toMatchObject({
      score: 0,
      passed: false,
    });
    const q = createSlide("quiz");
    q.data.questions[0].points = 0;
    expect(calculateQuizScore(q.data, {}).passed).toBe(false);
  });
  it("rejects invalid correctAnswerIndex but protects scoring if bad data reaches runtime", () => {
    const q = createSlide("quiz");
    q.data.questions[0].correctAnswerIndex = 999;
    expect(() => slideSchema.parse(q)).toThrow();
    expect(calculateQuizScore(q.data, {}).score).toBe(0);
    q.data.questions[0].points = -1;
    expect(() => slideSchema.parse(q)).toThrow();
    expect(calculateQuizScore(q.data, {}).score).toBe(0);
  });
  it("validates scenario choice limits and recommended answer", () => {
    const s = createSlide("scenario");
    s.data.choices = s.data.choices.slice(0, 1);
    expect(() => slideSchema.parse(s)).toThrow();
    s.data.choices = [...Array(5)].map((_, i) => ({
      ...s.data.choices[0],
      id: String(i),
      isRecommended: false,
    }));
    expect(() => slideSchema.parse(s)).toThrow();
  });
  it("submits only once, enforces attempts and lesson retry permission", () => {
    const { p, slide } = quizProject();
    slide.data.attemptsAllowed = 2;
    let s = createSession(p);
    s = sessionReducer(p, s, { type: "submit", id: slide.id });
    expect(s.quizAttempts[slide.id].history).toHaveLength(1);
    expect(sessionReducer(p, s, { type: "submit", id: slide.id })).toEqual(s);
    expect(canRetry(slide.data, s.quizAttempts[slide.id], false)).toBe(false);
    s = sessionReducer(p, s, { type: "quizRetry", id: slide.id });
    s = sessionReducer(p, s, { type: "submit", id: slide.id });
    expect(canRetry(slide.data, s.quizAttempts[slide.id], true)).toBe(false);
  });
  it("keeps answers when navigating and clears draft answers on retry", () => {
    const { p, slide } = quizProject();
    const q = slide.data.questions[0];
    let s = createSession(p);
    s = sessionReducer(p, s, {
      type: "answer",
      id: slide.id,
      questionId: q.id,
      optionId: q.options[0].id,
    });
    s = sessionReducer(p, s, { type: "visit", id: slide.id });
    expect(s.quizAttempts[slide.id].answers[q.id]).toBe(q.options[0].id);
    s = sessionReducer(p, s, { type: "submit", id: slide.id });
    s = sessionReducer(p, s, { type: "quizRetry", id: slide.id });
    expect(s.quizAttempts[slide.id].answers).toEqual({});
  });
  it("uses visited unique slide IDs for progress and ignores foreign IDs", () => {
    const p = createSampleProject();
    let s = createSession(p);
    s = sessionReducer(p, s, { type: "visit", id: p.slides[13].id });
    expect(progress(p, s)).toBe(14);
    s = sessionReducer(p, s, { type: "visit", id: p.slides[13].id });
    expect(progress(p, s)).toBe(14);
    expect(sessionReducer(p, s, { type: "visit", id: "unknown" })).toEqual(s);
    expect(progress({ ...p, slides: [] }, s)).toBe(0);
  });
  it("does not use rounded display progress to waive an unvisited required slide", () => {
    const p = createProject();
    p.settings.requireQuiz = false;
    p.slides = Array.from({ length: 201 }, () => createSlide("content"));
    const s = createSession(p);
    s.visitedSlideIds = p.slides.slice(0, 200).map((slide) => slide.id);
    expect(progress(p, s)).toBe(100);
    expect(deriveCompletionState(p, s)).toBe("IN_PROGRESS");
  });
  it("derives IN_PROGRESS and COMPLETED without a required quiz", () => {
    const p = createProject();
    let s = createSession(p);
    p.settings.requireQuiz = false;
    expect(deriveCompletionState(p, s)).toBe("IN_PROGRESS");
    s = sessionReducer(p, s, { type: "visit", id: p.slides[1].id });
    expect(deriveCompletionState(p, s)).toBe("COMPLETED");
    p.settings.requireQuiz = true;
    expect(deriveCompletionState(p, s)).toBe("IN_PROGRESS");
  });
  it("derives FAILED and PASSED using weighted aggregate across quizzes", () => {
    const { p, slide } = quizProject();
    let s = createSession(p);
    s = sessionReducer(p, s, { type: "submit", id: slide.id });
    expect(deriveCompletionState(p, s)).toBe("FAILED");
    s = sessionReducer(p, s, { type: "quizRetry", id: slide.id });
    slide.data.questions.forEach((q) => {
      s = sessionReducer(p, s, {
        type: "answer",
        id: slide.id,
        questionId: q.id,
        optionId: q.options[q.correctAnswerIndex].id,
      });
    });
    s = sessionReducer(p, s, { type: "submit", id: slide.id });
    expect(deriveCompletionState(p, s)).toBe("PASSED");
  });
  it("shuffles deterministically without changing correct answer mapping or authoring data", () => {
    const { slide } = quizProject();
    slide.data.shuffleQuestions = true;
    const before = structuredClone(slide.data);
    expect(orderedQuestions(slide.data, 1)).toEqual(
      orderedQuestions(slide.data, 1),
    );
    const q = slide.data.questions[0];
    expect(new Set(orderedOptions(q, true, 2).map((o) => o.id))).toEqual(
      new Set(q.options.map((o) => o.id)),
    );
    expect(slide.data).toEqual(before);
  });
  it("fixture has 14 slides and 10 questions split 4/3/3 with 100 points", () => {
    const p = createSampleProject();
    const questions = p.slides.flatMap((s) =>
      s.type === "quiz" ? s.data.questions : [],
    );
    expect(p.slides).toHaveLength(14);
    expect(questions).toHaveLength(10);
    expect(questions.filter((q) => q.level === "RECOGNITION")).toHaveLength(4);
    expect(questions.filter((q) => q.level === "UNDERSTANDING")).toHaveLength(
      3,
    );
    expect(questions.filter((q) => q.level === "APPLICATION")).toHaveLength(3);
    expect(questions.reduce((n, q) => n + q.points, 0)).toBe(100);
  });
  it("keeps canonical project unchanged throughout a session", () => {
    const p = createSampleProject(),
      before = structuredClone(p);
    let s = createSession(p);
    for (const slide of p.slides) {
      s = sessionReducer(p, s, { type: "visit", id: slide.id });
      if (slide.type === "quiz")
        s = sessionReducer(p, s, { type: "submit", id: slide.id });
    }
    expect(p).toEqual(before);
    expect(JSON.parse(exportProjectJSON(p))).not.toHaveProperty("quizAnswers");
  });
});
