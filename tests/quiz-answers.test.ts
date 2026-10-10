import { expect, it } from "vitest";
import { createProject, createSlide } from "../src/model/factories";
import { parseProject, type LessonProject } from "../src/model/schema";
import {
  answerOf,
  correctIndexes,
  isMultiAnswer,
  isRightAnswer,
  withCorrect,
} from "../src/model/answers";
import {
  calculateQuizScore,
  createSession,
  sessionReducer,
} from "../src/player/session";
import { decodeResume, encodeResume } from "../src/player/resume";
import { exportIssues } from "../src/export/package";
import { lessonTitle } from "../src/import/pptx/build";

type Quiz = Extract<LessonProject["slides"][number], { type: "quiz" }>;

/** "Cần những thông tin gì?" from Bài 3 tiết 1: three of four options are right. */
function lesson() {
  const p = createProject("Bài 3");
  const quiz = createSlide("quiz");
  quiz.data.questions = [
    {
      id: "q-multi",
      level: "RECOGNITION",
      prompt: "Để chuẩn bị cho chuyến đi tham quan, em cần những thông tin gì?",
      options: [
        { id: "a", text: "Vị trí của điểm tham quan" },
        { id: "b", text: "Dự báo thời tiết" },
        { id: "c", text: "Màu yêu thích của bạn" },
        { id: "d", text: "Chương trình tham quan" },
      ],
      correctAnswerIndex: 0,
      correctAnswerIndexes: [0, 1, 3],
      explanation: "",
      points: 10,
    },
    {
      id: "q-one",
      level: "RECOGNITION",
      prompt: "Thông tin nào cần tìm trước?",
      options: [
        { id: "e", text: "Thời tiết" },
        { id: "f", text: "Giá điện thoại" },
      ],
      correctAnswerIndex: 0,
      explanation: "",
      points: 10,
    },
  ];
  p.slides = [quiz];
  return parseProject(p);
}
const quizOf = (p: LessonProject) => p.slides[0] as Quiz;

it("knows a question with several right answers", () => {
  const [multi, one] = quizOf(lesson()).data.questions;
  expect(correctIndexes(multi)).toEqual([0, 1, 3]);
  expect(isMultiAnswer(multi)).toBe(true);
  expect(isMultiAnswer(one)).toBe(false);
  // Bad data never gives points to a missing option.
  expect(correctIndexes({ ...one, correctAnswerIndex: 9 })).toEqual([]);
});

it("gives points only when every right answer and nothing else is ticked", () => {
  const multi = quizOf(lesson()).data.questions[0];
  expect(isRightAnswer(multi, answerOf(["d", "a", "b"]))).toBe(true);
  expect(isRightAnswer(multi, answerOf(["a", "b"]))).toBe(false);
  expect(isRightAnswer(multi, answerOf(["a", "b", "c", "d"]))).toBe(false);
  expect(isRightAnswer(multi, "")).toBe(false);
  const data = quizOf(lesson()).data;
  expect(
    calculateQuizScore(data, { "q-multi": "a,b,d", "q-one": "e" }).score,
  ).toBe(100);
  expect(calculateQuizScore(data, { "q-multi": "a,b", "q-one": "e" }).score).toBe(
    50,
  );
});

it("lets the student tick and untick options of a several-answer question", () => {
  const p = lesson();
  const id = p.slides[0].id;
  const tick = (s: ReturnType<typeof createSession>, optionId: string) =>
    sessionReducer(p, s, {
      type: "answer",
      id,
      questionId: "q-multi",
      optionId,
    });
  let s = createSession(p);
  s = tick(tick(tick(s, "a"), "b"), "c");
  expect(s.quizAttempts[id].answers["q-multi"]).toBe("a,b,c");
  s = tick(s, "c");
  s = tick(s, "d");
  expect(s.quizAttempts[id].answers["q-multi"]).toBe("a,b,d");
  // A one-answer question still replaces the choice.
  s = sessionReducer(p, s, { type: "answer", id, questionId: "q-one", optionId: "e" });
  s = sessionReducer(p, s, { type: "answer", id, questionId: "q-one", optionId: "f" });
  expect(s.quizAttempts[id].answers["q-one"]).toBe("f");
  s = sessionReducer(p, s, { type: "submit", id });
  expect(s.quizAttempts[id].history[0].result.score).toBe(50);
});

it("keeps ticked answers when the student comes back, and drops forged ones", () => {
  const p = lesson();
  const id = p.slides[0].id;
  let s = createSession(p);
  for (const o of ["a", "d"])
    s = sessionReducer(p, s, { type: "answer", id, questionId: "q-multi", optionId: o });
  s = sessionReducer(p, s, { type: "answer", id, questionId: "q-one", optionId: "e" });
  const back = decodeResume(p, encodeResume(p, s))!;
  expect(back.quizAttempts[id].answers).toEqual({ "q-multi": "a,d", "q-one": "e" });
  const forged = JSON.stringify({
    v: 1,
    c: 0,
    s: [0],
    q: { 0: { a: { "q-one": "e,f", "q-multi": "a,zz" }, h: [], s: 0 } },
  });
  expect(decodeResume(p, forged)!.quizAttempts[id].answers).toEqual({});
});

it("setting the right answers settles a question PowerPoint left unknown", () => {
  const q = { ...quizOf(lesson()).data.questions[1], answerUnknown: true };
  const fixed = withCorrect(q, [1]);
  expect(fixed.answerUnknown).toBeUndefined();
  expect(fixed.correctAnswerIndex).toBe(1);
  expect(fixed.correctAnswerIndexes).toBeUndefined();
  const two = withCorrect(quizOf(lesson()).data.questions[0], [3, 1]);
  expect(two.correctAnswerIndexes).toEqual([1, 3]);
  expect(two.correctAnswerIndex).toBe(1);
});

it("will not export a lesson while a question has no chosen answer", () => {
  const p = lesson();
  quizOf(p).data.questions[1].answerUnknown = true;
  const block = exportIssues(p).find((i) => i.level === "BLOCK");
  expect(block?.message).toMatch(/câu 2 chưa chọn đáp án đúng/);
  quizOf(p).data.questions[1] = withCorrect(quizOf(p).data.questions[1], [0]);
  expect(exportIssues(p).some((i) => i.level === "BLOCK")).toBe(false);
});

it("drops the .pptx ending from an imported lesson title", () => {
  expect(lessonTitle("Bài 3 (T1).pptx")).toBe("Bài 3 (T1)");
  expect(lessonTitle("Bài 3 (T1).pptx.PPTX ")).toBe("Bài 3 (T1)");
  expect(lessonTitle("Bài 3")).toBe("Bài 3");
});

