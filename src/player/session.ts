import type { LessonProject, Question, QuizData, Slide } from "../model/schema";
import {
  answerIds,
  answerOf,
  isMultiAnswer,
  isRightAnswer,
} from "../model/answers";
export interface QuizResult {
  score: number;
  earnedPoints: number;
  availablePoints: number;
  passed: boolean;
}
export interface QuizAttempt {
  answers: Record<string, string>;
  result: QuizResult;
}
export interface QuizSession {
  answers: Record<string, string>;
  history: QuizAttempt[];
  submitted: boolean;
}
export interface LessonSessionState {
  currentSlideId: string | null;
  visitedSlideIds: string[];
  interactions: Record<string, { selectedIds?: string[]; choiceId?: string }>;
  quizAttempts: Record<string, QuizSession>;
}
export function createSession(
  p: LessonProject,
  id: string | null = null,
): LessonSessionState {
  const currentSlideId = p.slides.some((s) => s.id === id)
    ? id
    : (p.slides[0]?.id ?? null);
  return {
    currentSlideId,
    visitedSlideIds: currentSlideId ? [currentSlideId] : [],
    interactions: {},
    quizAttempts: {},
  };
}
export function visit(s: LessonSessionState, id: string): LessonSessionState {
  return {
    ...s,
    currentSlideId: id,
    visitedSlideIds: s.visitedSlideIds.includes(id)
      ? s.visitedSlideIds
      : [...s.visitedSlideIds, id],
  };
}
export function progress(p: LessonProject, s: LessonSessionState) {
  if (!p.slides.length) return 0;
  const ids = new Set(s.visitedSlideIds);
  return Math.round(
    (p.slides.filter((x) => ids.has(x.id)).length / p.slides.length) * 100,
  );
}
export function calculateQuizScore(
  q: QuizData,
  answers: Record<string, string>,
): QuizResult {
  let availablePoints = 0,
    earnedPoints = 0;
  q.questions.forEach((x) => {
    if (!Number.isFinite(x.points) || x.points < 0) return;
    availablePoints += x.points;
    if (isRightAnswer(x, answers[x.id])) earnedPoints += x.points;
  });
  const score =
    availablePoints > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((earnedPoints / availablePoints) * 100)),
        )
      : 0;
  return {
    score,
    earnedPoints,
    availablePoints,
    passed:
      availablePoints > 0 && q.questions.length > 0 && score >= q.passingScore,
  };
}
export const emptyQuiz = (): QuizSession => ({
  answers: {},
  history: [],
  submitted: false,
});
export function canRetry(
  q: QuizData,
  session: QuizSession,
  lessonAllows: boolean,
) {
  return (
    lessonAllows &&
    session.submitted &&
    (q.attemptsAllowed === null || session.history.length < q.attemptsAllowed)
  );
}
export type SessionAction =
  | { type: "visit"; id: string }
  | { type: "warmup"; id: string; itemId: string }
  | { type: "scenario"; id: string; choiceId: string }
  | { type: "scenarioRetry"; id: string }
  | { type: "answer"; id: string; questionId: string; optionId: string }
  | { type: "submit"; id: string }
  | { type: "quizRetry"; id: string };
export function sessionReducer(
  p: LessonProject,
  s: LessonSessionState,
  a: SessionAction,
): LessonSessionState {
  const slide = p.slides.find((x) => x.id === a.id);
  if (!slide) return s;
  if (a.type === "visit") return visit(s, a.id);
  if (
    a.type === "warmup" &&
    slide.type === "warmup" &&
    slide.data.items.some((x) => x.id === a.itemId)
  ) {
    const selected = s.interactions[a.id]?.selectedIds ?? [];
    return {
      ...s,
      interactions: {
        ...s.interactions,
        [a.id]: { selectedIds: [...new Set([...selected, a.itemId])] },
      },
    };
  }
  if (slide.type === "scenario") {
    if (
      a.type === "scenario" &&
      !s.interactions[a.id]?.choiceId &&
      slide.data.choices.some((x) => x.id === a.choiceId)
    )
      return {
        ...s,
        interactions: { ...s.interactions, [a.id]: { choiceId: a.choiceId } },
      };
    if (
      a.type === "scenarioRetry" &&
      slide.data.allowRetry &&
      p.settings.allowRetry
    )
      return { ...s, interactions: { ...s.interactions, [a.id]: {} } };
  }
  if (slide.type === "quiz") {
    const q = s.quizAttempts[a.id] ?? emptyQuiz();
    let next = q;
    const question =
      a.type === "answer"
        ? slide.data.questions.find(
            (x) =>
              x.id === a.questionId &&
              x.options.some((o) => o.id === a.optionId),
          )
        : undefined;
    if (a.type === "answer" && question && !q.submitted) {
      // Several right answers: each tick toggles that option.
      let answer = a.optionId;
      if (isMultiAnswer(question)) {
        const ids = new Set(answerIds(q.answers[a.questionId]));
        if (ids.has(a.optionId)) ids.delete(a.optionId);
        else ids.add(a.optionId);
        answer = answerOf([...ids]);
      }
      const answers = { ...q.answers, [a.questionId]: answer };
      if (!answer) delete answers[a.questionId];
      next = { ...q, answers };
    }
    if (
      a.type === "submit" &&
      !q.submitted &&
      (slide.data.attemptsAllowed === null ||
        q.history.length < slide.data.attemptsAllowed)
    )
      next = {
        ...q,
        submitted: true,
        history: [
          ...q.history,
          {
            answers: { ...q.answers },
            result: calculateQuizScore(slide.data, q.answers),
          },
        ],
      };
    if (
      a.type === "quizRetry" &&
      canRetry(slide.data, q, p.settings.allowRetry)
    )
      next = { answers: {}, submitted: false, history: q.history };
    if (next !== q)
      return { ...s, quizAttempts: { ...s.quizAttempts, [a.id]: next } };
  }
  return s;
}
export function aggregateQuiz(p: LessonProject, s: LessonSessionState) {
  let earned = 0,
    total = 0,
    allSubmitted = true;
  const quizzes = p.slides.filter(
    (x): x is Extract<Slide, { type: "quiz" }> => x.type === "quiz",
  );
  for (const q of quizzes) {
    const state = s.quizAttempts[q.id];
    const latest = state?.submitted ? state.history.at(-1) : undefined;
    if (!latest) allSubmitted = false;
    const score = calculateQuizScore(q.data, latest?.answers ?? {});
    earned += score.earnedPoints;
    total += score.availablePoints;
  }
  return {
    score: total > 0 ? Math.round((earned / total) * 100) : 0,
    availablePoints: total,
    allSubmitted: quizzes.length > 0 && allSubmitted,
    hasQuiz: quizzes.length > 0,
  };
}
export function deriveCompletionState(
  p: LessonProject,
  s: LessonSessionState,
): "IN_PROGRESS" | "COMPLETED" | "PASSED" | "FAILED" {
  if (!p.slides.length) return "IN_PROGRESS";
  const visited = new Set(s.visitedSlideIds);
  if (
    p.settings.requireAllSlides &&
    p.slides.some((slide) => !visited.has(slide.id))
  )
    return "IN_PROGRESS";
  const result = aggregateQuiz(p, s);
  if (p.settings.requireQuiz && !result.allSubmitted) return "IN_PROGRESS";
  if (result.allSubmitted)
    return result.availablePoints > 0 && result.score >= p.settings.passingScore
      ? "PASSED"
      : "FAILED";
  return "COMPLETED";
}
function hash(s: string) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function orderedQuestions(q: QuizData, attempt: number): Question[] {
  return q.shuffleQuestions
    ? [...q.questions].sort(
        (a, b) => hash(a.id + attempt) - hash(b.id + attempt),
      )
    : q.questions;
}
export function orderedOptions(q: Question, shuffle: boolean, attempt: number) {
  return shuffle
    ? [...q.options].sort((a, b) => hash(a.id + attempt) - hash(b.id + attempt))
    : q.options;
}
