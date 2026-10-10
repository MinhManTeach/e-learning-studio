import { afterEach, expect, it, vi } from "vitest";
import { createProject, createSlide } from "../src/model/factories";
import type { LessonProject } from "../src/model/schema";
import {
  connectLms,
  findScormApi,
  formatLmsName,
  Scorm12Adapter,
  scormTimespan,
  StandaloneAdapter,
  type Scorm12Api,
} from "../src/player/lms";
import { decodeResume, encodeResume, lmsReport } from "../src/player/resume";
import { createSession, sessionReducer } from "../src/player/session";

afterEach(() => vi.useRealTimers());

/** In-memory SCORM 1.2 LMS that records every call, like a test harness. */
function fakeLms(initial: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "cmi.core.lesson_status": "not attempted",
    "cmi.suspend_data": "",
    ...initial,
  };
  const calls: string[] = [];
  const api: Scorm12Api = {
    LMSInitialize: () => (calls.push("init"), "true"),
    LMSFinish: () => (calls.push("finish"), "true"),
    LMSGetValue: (k) => values[k] ?? "",
    LMSSetValue: (k, v) => ((values[k] = v), "true"),
    LMSCommit: () => (calls.push("commit"), "true"),
    LMSGetLastError: () => "0",
  };
  return { api, values, calls };
}

function lesson(): LessonProject {
  const p = createProject("Bài 4. Làm việc với máy tính");
  const quiz = createSlide("quiz");
  p.slides = [createSlide("welcome"), createSlide("content"), quiz];
  p.settings = {
    ...p.settings,
    passingScore: 80,
    requireQuiz: true,
    requireAllSlides: false,
  };
  return p;
}
const quizOf = (p: LessonProject) => {
  const s = p.slides.find((x) => x.type === "quiz");
  if (s?.type !== "quiz") throw new Error("fixture needs a quiz");
  return s;
};
function answerAll(p: LessonProject, correct: boolean) {
  const quiz = quizOf(p);
  let s = createSession(p);
  for (const q of quiz.data.questions) {
    const right = q.options[q.correctAnswerIndex];
    const wrong = q.options.find((o) => o.id !== right.id) ?? right;
    s = sessionReducer(p, s, {
      type: "answer",
      id: quiz.id,
      questionId: q.id,
      optionId: (correct ? right : wrong).id,
    });
  }
  return sessionReducer(p, s, { type: "submit", id: quiz.id });
}

it("finds the LMS API in a parent frame, the way Moodle and K12Online host a SCO", () => {
  const { api } = fakeLms();
  const top = { API: api } as unknown as Window;
  const middle = { parent: top } as unknown as Window;
  const frame = { parent: middle } as unknown as Window;
  expect(findScormApi(frame)).toBe(api);
});

it("finds the API through the opener when the LMS opens the lesson in a new window", () => {
  const { api } = fakeLms();
  const opener = { API: api } as unknown as Window;
  const popup = { opener } as unknown as Window;
  (popup as unknown as { parent: Window }).parent = popup;
  expect(findScormApi(popup)).toBe(api);
});

it("falls back to standalone mode with no LMS and still remembers the place", () => {
  const store = new Map<string, string>();
  const win = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  } as unknown as Window;
  (win as unknown as { parent: Window }).parent = win;
  const lms = connectLms(win, "lesson-1");
  expect(lms.kind).toBe("STANDALONE");
  lms.report({ status: "incomplete", suspendData: "abc", location: "2" });
  expect(connectLms(win, "lesson-1").readSuspendData()).toBe("abc");
});

it("keeps working when the browser blocks storage", () => {
  const lms = new StandaloneAdapter("k", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(lms.readSuspendData()).toBe("");
  expect(() =>
    lms.report({ status: "incomplete", suspendData: "x", location: "1" }),
  ).not.toThrow();
});

it("marks a new attempt incomplete and asks the LMS to resume it later", () => {
  vi.useFakeTimers();
  const { api, values, calls } = fakeLms();
  const lms = new Scorm12Adapter(api);
  expect(lms.initialize()).toBe(true);
  expect(values["cmi.core.lesson_status"]).toBe("incomplete");
  const p = lesson();
  lms.report(lmsReport(p, createSession(p)));
  expect(values["cmi.core.exit"]).toBe("suspend");
  expect(values["cmi.core.lesson_location"]).toBe("1");
  expect(values["cmi.core.score.raw"]).toBeUndefined();
  expect(calls).not.toContain("commit");
  vi.advanceTimersByTime(2000);
  expect(calls).toContain("commit");
});

it("reports passed with a 0–100 score once the quiz meets the mastery score", () => {
  const { api, values } = fakeLms();
  const lms = new Scorm12Adapter(api);
  lms.initialize();
  const p = lesson();
  lms.report(lmsReport(p, answerAll(p, true)));
  expect(values["cmi.core.lesson_status"]).toBe("passed");
  expect(values["cmi.core.score.raw"]).toBe("100");
  expect(values["cmi.core.score.max"]).toBe("100");
  expect(values["cmi.core.exit"]).toBe("");
});

it("reports failed when the quiz is below the mastery score", () => {
  const { api, values } = fakeLms();
  const lms = new Scorm12Adapter(api);
  lms.initialize();
  const p = lesson();
  lms.report(lmsReport(p, answerAll(p, false)));
  expect(values["cmi.core.lesson_status"]).toBe("failed");
  expect(values["cmi.core.score.raw"]).toBe("0");
});

it("does not turn a passed attempt back into incomplete when the student reviews it", () => {
  const { api, values } = fakeLms({ "cmi.core.lesson_status": "passed" });
  const lms = new Scorm12Adapter(api);
  lms.initialize();
  const p = lesson();
  lms.report(lmsReport(p, createSession(p)));
  expect(values["cmi.core.lesson_status"]).toBe("passed");
});

it("records session time and closes the attempt once", () => {
  let now = 1_000;
  const { api, values, calls } = fakeLms();
  const lms = new Scorm12Adapter(api, () => now);
  lms.initialize();
  now += (2 * 60 + 5) * 1000;
  lms.finish();
  lms.finish();
  expect(values["cmi.core.session_time"]).toBe("00:02:05");
  expect(calls.filter((c) => c === "finish")).toHaveLength(1);
});

it("formats long sessions as SCORM 1.2 timespans", () => {
  expect(scormTimespan(0)).toBe("00:00:00");
  expect(scormTimespan((27 * 3600 + 3 * 60 + 9) * 1000)).toBe("27:03:09");
});

it("resumes on the same page with the same quiz answers and recomputed score", () => {
  const p = lesson();
  let s = answerAll(p, true);
  s = sessionReducer(p, s, { type: "visit", id: p.slides[1].id });
  const restored = decodeResume(p, encodeResume(p, s));
  expect(restored?.currentSlideId).toBe(p.slides[1].id);
  expect(restored?.quizAttempts[quizOf(p).id].history[0].result.score).toBe(
    100,
  );
  expect(lmsReport(p, restored!).status).toBe("passed");
});

it("ignores saved answers the lesson no longer has instead of trusting them", () => {
  const p = lesson();
  const quiz = quizOf(p);
  const saved = JSON.stringify({
    v: 1,
    c: 99,
    s: [0, 7],
    q: { 2: { a: { [quiz.data.questions[0].id]: "hacked" }, h: [], s: 1 } },
  });
  const restored = decodeResume(p, saved)!;
  expect(restored.currentSlideId).toBe(p.slides[0].id);
  expect(restored.visitedSlideIds).toEqual([p.slides[0].id]);
  expect(restored.quizAttempts[quiz.id].submitted).toBe(false);
  expect(restored.quizAttempts[quiz.id].answers).toEqual({});
});

it("starts fresh on unreadable saved data", () => {
  const p = lesson();
  expect(decodeResume(p, "")).toBeNull();
  expect(decodeResume(p, "{not json")).toBeNull();
  expect(decodeResume(p, JSON.stringify({ v: 2 }))).toBeNull();
});

it("shrinks resume data to fit SCORM 1.2's 4096 characters, keeping the page", () => {
  const p = lesson();
  let s = answerAll(p, false);
  const quiz = quizOf(p);
  for (let i = 0; i < 60; i++) {
    s = sessionReducer(p, s, { type: "quizRetry", id: quiz.id });
    const q = quiz.data.questions[0];
    s = sessionReducer(p, s, {
      type: "answer",
      id: quiz.id,
      questionId: q.id,
      optionId: q.options[i % q.options.length].id,
    });
    s = sessionReducer(p, s, { type: "submit", id: quiz.id });
  }
  s = sessionReducer(p, s, { type: "visit", id: p.slides[1].id });
  const full = encodeResume(p, s, 1_000_000);
  const fitted = encodeResume(p, s, 600);
  expect(full.length).toBeGreaterThan(600);
  expect(fitted.length).toBeLessThanOrEqual(600);
  expect(decodeResume(p, fitted)?.currentSlideId).toBe(p.slides[1].id);
});

it("reads the learner's name from the LMS in Vietnamese order", () => {
  const { api } = fakeLms({ "cmi.core.student_name": "Nguyễn Văn, An" });
  const lms = new Scorm12Adapter(api);
  expect(lms.studentName()).toBe("");
  lms.initialize();
  expect(lms.studentName()).toBe("Nguyễn Văn An");
});

it("tidies LMS names that are not in Last, First form", () => {
  expect(formatLmsName("  Trần   Thị Bình ")).toBe("Trần Thị Bình");
  expect(formatLmsName("Lê,")).toBe("Lê");
  expect(formatLmsName("")).toBe("");
});
