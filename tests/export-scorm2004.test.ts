import { afterEach, expect, it, vi } from "vitest";
import { createProject, createSlide } from "../src/model/factories";
import type { LessonProject } from "../src/model/schema";
import {
  connectLms,
  findScorm2004Api,
  Scorm2004Adapter,
  scormDuration,
  type Scorm2004Api,
  type Scorm12Api,
} from "../src/player/lms";
import { lmsReport } from "../src/player/resume";
import { createSession, sessionReducer } from "../src/player/session";

afterEach(() => vi.useRealTimers());

/** In-memory SCORM 2004 LMS (API_1484_11) that records every call. */
function fakeLms(initial: Record<string, string> = {}) {
  const values: Record<string, string> = {
    "cmi.completion_status": "unknown",
    "cmi.success_status": "unknown",
    "cmi.suspend_data": "",
    ...initial,
  };
  const calls: string[] = [];
  const api: Scorm2004Api = {
    Initialize: () => (calls.push("init"), "true"),
    Terminate: () => (calls.push("terminate"), "true"),
    GetValue: (k) => values[k] ?? "",
    SetValue: (k, v) => ((values[k] = v), "true"),
    Commit: () => (calls.push("commit"), "true"),
    GetLastError: () => "0",
  };
  return { api, values, calls };
}

function lesson(): LessonProject {
  const p = createProject("Bài 4. Làm việc với máy tính");
  p.slides = [
    createSlide("welcome"),
    createSlide("content"),
    createSlide("quiz"),
  ];
  p.settings = {
    ...p.settings,
    passingScore: 80,
    requireQuiz: true,
    requireAllSlides: false,
  };
  return p;
}
function answerAll(p: LessonProject, correct: boolean) {
  const quiz = p.slides.find((x) => x.type === "quiz");
  if (quiz?.type !== "quiz") throw new Error("fixture needs a quiz");
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

it("finds the SCORM 2004 API (API_1484_11) in a parent frame", () => {
  const { api } = fakeLms();
  const top = { API_1484_11: api } as unknown as Window;
  const frame = { parent: { parent: top } } as unknown as Window;
  expect(findScorm2004Api(frame)).toBe(api);
});

it("connects as SCORM 2004 when the LMS offers it, before looking for SCORM 1.2", () => {
  const { api } = fakeLms();
  const old = {} as Scorm12Api;
  const win = { API_1484_11: api, API: old } as unknown as Window;
  (win as unknown as { parent: Window }).parent = win;
  expect(connectLms(win, "lesson-1").kind).toBe("SCORM_2004");
});

it("marks a new attempt incomplete and asks the LMS to resume it later", () => {
  vi.useFakeTimers();
  const { api, values, calls } = fakeLms();
  const lms = new Scorm2004Adapter(api);
  expect(lms.initialize()).toBe(true);
  expect(values["cmi.completion_status"]).toBe("incomplete");
  const p = lesson();
  lms.report(lmsReport(p, createSession(p)));
  expect(values["cmi.exit"]).toBe("suspend");
  expect(values["cmi.location"]).toBe("1");
  expect(values["cmi.score.scaled"]).toBeUndefined();
  expect(values["cmi.success_status"]).toBe("unknown");
  expect(calls).not.toContain("commit");
  vi.advanceTimersByTime(2000);
  expect(calls).toContain("commit");
});

it("reports completed and passed with a scaled score when the quiz is passed", () => {
  const { api, values } = fakeLms();
  const lms = new Scorm2004Adapter(api);
  lms.initialize();
  const p = lesson();
  lms.report(lmsReport(p, answerAll(p, true)));
  expect(values["cmi.completion_status"]).toBe("completed");
  expect(values["cmi.success_status"]).toBe("passed");
  expect(values["cmi.score.scaled"]).toBe("1");
  expect(values["cmi.score.raw"]).toBe("100");
  expect(values["cmi.score.min"]).toBe("0");
  expect(values["cmi.score.max"]).toBe("100");
  expect(values["cmi.exit"]).toBe("normal");
});

it("reports failed (but completed) when the quiz is below the passing score", () => {
  const { api, values } = fakeLms();
  const lms = new Scorm2004Adapter(api);
  lms.initialize();
  const p = lesson();
  lms.report(lmsReport(p, answerAll(p, false)));
  expect(values["cmi.completion_status"]).toBe("completed");
  expect(values["cmi.success_status"]).toBe("failed");
  expect(values["cmi.score.scaled"]).toBe("0");
});

it("reports a lesson without a quiz as completed with no pass/fail verdict", () => {
  const { api, values } = fakeLms();
  const lms = new Scorm2004Adapter(api);
  lms.initialize();
  lms.report({ status: "completed", suspendData: "", location: "3" });
  expect(values["cmi.completion_status"]).toBe("completed");
  expect(values["cmi.success_status"]).toBe("unknown");
});

it("does not turn a passed attempt back into incomplete when the student reviews it", () => {
  const { api, values } = fakeLms({
    "cmi.completion_status": "completed",
    "cmi.success_status": "passed",
  });
  const lms = new Scorm2004Adapter(api);
  lms.initialize();
  const p = lesson();
  lms.report(lmsReport(p, createSession(p)));
  expect(values["cmi.completion_status"]).toBe("completed");
  expect(values["cmi.success_status"]).toBe("passed");
});

it("records session time as an ISO 8601 duration and terminates once", () => {
  let now = 1_000;
  const { api, values, calls } = fakeLms();
  const lms = new Scorm2004Adapter(api, () => now);
  lms.initialize();
  now += (2 * 60 + 5) * 1000;
  lms.finish();
  lms.finish();
  expect(values["cmi.session_time"]).toBe("PT2M5S");
  expect(calls.filter((c) => c === "terminate")).toHaveLength(1);
});

it("formats SCORM 2004 durations", () => {
  expect(scormDuration(0)).toBe("PT0S");
  expect(scormDuration((27 * 3600 + 3 * 60 + 9) * 1000)).toBe("PT27H3M9S");
  expect(scormDuration(3600 * 1000)).toBe("PT1H");
});

it("reads the learner's name in Vietnamese order", () => {
  const { api } = fakeLms({ "cmi.learner_name": "Nguyễn Văn, An" });
  const lms = new Scorm2004Adapter(api);
  expect(lms.studentName()).toBe("");
  lms.initialize();
  expect(lms.studentName()).toBe("Nguyễn Văn An");
});

it("does nothing when the LMS refuses to start the attempt", () => {
  const { api, values } = fakeLms();
  api.Initialize = () => "false";
  const lms = new Scorm2004Adapter(api);
  expect(lms.initialize()).toBe(false);
  lms.report({ status: "passed", score: 90, suspendData: "", location: "1" });
  expect(values["cmi.success_status"]).toBe("unknown");
});
