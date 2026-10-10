import type { LessonProject } from "../model/schema";
import {
  calculateQuizScore,
  createSession,
  deriveCompletionState,
  aggregateQuiz,
  type LessonSessionState,
  type QuizSession,
} from "./session";
import type { LmsReport, LmsStatus } from "./lms";
import { answerIds, answerOf, isMultiAnswer } from "../model/answers";

// Resume data is keyed by page position, not by ID, so it stays small enough for
// SCORM 1.2's 4096-character suspend_data. Quiz results are recomputed on load
// from the stored answers rather than trusted from storage.
interface ResumeQuiz {
  a: Record<string, string>; // current answers
  h: Record<string, string>[]; // answers of each submitted attempt
  s: 0 | 1; // submitted
}
interface ResumeData {
  v: 1;
  c: number; // current page index
  s: number[]; // visited page indexes
  i?: Record<string, { s?: string[]; c?: string }>;
  q?: Record<string, ResumeQuiz>;
}

export function encodeResume(
  p: LessonProject,
  state: LessonSessionState,
  limit = 4096,
): string {
  const index = new Map(p.slides.map((s, i) => [s.id, i]));
  const visited = state.visitedSlideIds
    .map((id) => index.get(id))
    .filter((i): i is number => i !== undefined);
  const base: ResumeData = {
    v: 1,
    c: index.get(state.currentSlideId ?? "") ?? 0,
    s: visited,
  };
  const interactions: NonNullable<ResumeData["i"]> = {};
  for (const [id, x] of Object.entries(state.interactions)) {
    const i = index.get(id);
    if (i === undefined) continue;
    interactions[i] = {
      ...(x.selectedIds?.length ? { s: x.selectedIds } : {}),
      ...(x.choiceId ? { c: x.choiceId } : {}),
    };
  }
  const quizzes = (keepHistory: boolean) => {
    const out: NonNullable<ResumeData["q"]> = {};
    for (const [id, q] of Object.entries(state.quizAttempts)) {
      const i = index.get(id);
      if (i === undefined) continue;
      const history = q.history.map((h) => h.answers);
      out[i] = {
        a: q.answers,
        h: keepHistory ? history : history.slice(-1),
        s: q.submitted ? 1 : 0,
      };
    }
    return out;
  };
  // Shrink step by step until it fits: full data, last attempt only, no
  // activity choices, then position only. Losing detail beats losing resume.
  const candidates: ResumeData[] = [
    { ...base, i: interactions, q: quizzes(true) },
    { ...base, i: interactions, q: quizzes(false) },
    { ...base, q: quizzes(false) },
    base,
    { ...base, s: [] },
  ];
  for (const c of candidates) {
    const text = JSON.stringify(c);
    if (text.length <= limit) return text;
  }
  return JSON.stringify({ v: 1, c: 0, s: [] });
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Rebuilds a session from saved data; anything that no longer matches the lesson is dropped. */
export function decodeResume(
  p: LessonProject,
  text: string,
): LessonSessionState | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== 1 || !p.slides.length) return null;
  const at = (i: unknown) =>
    typeof i === "number" || typeof i === "string"
      ? p.slides[Number(i)]
      : undefined;
  const current = at(data.c) ?? p.slides[0];
  const state = createSession(p, current.id);
  const visited = new Set(state.visitedSlideIds);
  if (Array.isArray(data.s))
    for (const i of data.s) {
      const s = at(i);
      if (s) visited.add(s.id);
    }
  state.visitedSlideIds = p.slides
    .filter((s) => visited.has(s.id))
    .map((s) => s.id);
  if (isRecord(data.i))
    for (const [i, raw] of Object.entries(data.i)) {
      const slide = at(i);
      if (!slide || !isRecord(raw)) continue;
      if (slide.type === "warmup") {
        const ids = new Set(slide.data.items.map((x) => x.id));
        const selected = strings(raw.s).filter((x) => ids.has(x));
        if (selected.length)
          state.interactions[slide.id] = { selectedIds: selected };
      }
      if (
        slide.type === "scenario" &&
        typeof raw.c === "string" &&
        slide.data.choices.some((x) => x.id === raw.c)
      )
        state.interactions[slide.id] = { choiceId: raw.c };
    }
  if (isRecord(data.q))
    for (const [i, raw] of Object.entries(data.q)) {
      const slide = at(i);
      if (!slide || slide.type !== "quiz" || !isRecord(raw)) continue;
      const valid = (answers: unknown) => {
        const out: Record<string, string> = {};
        if (!isRecord(answers)) return out;
        for (const q of slide.data.questions) {
          const a = answers[q.id];
          if (typeof a !== "string") continue;
          const ids = answerIds(a);
          const known = ids.every((id) => q.options.some((o) => o.id === id));
          if (ids.length && known && (ids.length === 1 || isMultiAnswer(q)))
            out[q.id] = answerOf(ids);
        }
        return out;
      };
      const history = (Array.isArray(raw.h) ? raw.h : [])
        .map(valid)
        .map((answers) => ({
          answers,
          result: calculateQuizScore(slide.data, answers),
        }));
      const submitted = raw.s === 1 && history.length > 0;
      const quiz: QuizSession = {
        answers: submitted ? history[history.length - 1].answers : valid(raw.a),
        history,
        submitted,
      };
      state.quizAttempts[slide.id] = quiz;
    }
  return state;
}

const statusMap: Record<ReturnType<typeof deriveCompletionState>, LmsStatus> = {
  IN_PROGRESS: "incomplete",
  COMPLETED: "completed",
  PASSED: "passed",
  FAILED: "failed",
};
/** Everything the LMS should know about the current session. */
export function lmsReport(
  p: LessonProject,
  state: LessonSessionState,
): LmsReport {
  const quiz = aggregateQuiz(p, state);
  const anySubmitted = Object.values(state.quizAttempts).some(
    (q) => q.history.length > 0,
  );
  const index = p.slides.findIndex((s) => s.id === state.currentSlideId);
  return {
    status: statusMap[deriveCompletionState(p, state)],
    score: quiz.hasQuiz && anySubmitted ? quiz.score : undefined,
    suspendData: encodeResume(p, state),
    location: String(Math.max(0, index) + 1),
  };
}
