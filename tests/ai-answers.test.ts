import { expect, it } from "vitest";
import { parseProject, type LessonProject } from "../src/model/schema";
import { lessonRequest } from "../src/ai/request";
import {
  answerSuggestions,
  applyDesign,
  designPlanSchema,
  designWireSchema,
} from "../src/ai/design";
import { aiLesson, aiPlan } from "./support/aiLesson";

type Quiz = Extract<LessonProject["slides"][number], { type: "quiz" }>;

function unknownLesson() {
  const p = aiLesson();
  const quiz = p.slides.find((s) => s.type === "quiz") as Quiz;
  quiz.data.questions[0] = { ...quiz.data.questions[0], answerUnknown: true };
  quiz.data.questions[1] = {
    ...quiz.data.questions[1],
    correctAnswerIndexes: [0, 1],
  };
  return parseProject(p);
}

it("tells the AI which answers are known, which are several, and which are missing", () => {
  const request = lessonRequest(unknownLesson());
  const qs = request.slides.find((s) => s.id === "s-quiz")?.questions ?? [];
  expect(qs.map((q) => q.correct)).toEqual([[], [0, 1]]);
  const wire = designWireSchema() as {
    properties: { answers: { items: { properties: object } } };
  };
  expect(Object.keys(wire.properties.answers.items.properties)).toEqual([
    "questionId",
    "correct",
  ]);
});

it("offers the AI's answer only for questions without one, and applies only what the teacher ticks", () => {
  const p = unknownLesson();
  const plan = designPlanSchema.parse({
    ...aiPlan,
    explanations: [
      { questionId: "q1", explanation: "Phải tắt máy đúng cách." },
    ],
    answers: [
      { questionId: "q1", correct: [1, 7] },
      { questionId: "q2", correct: [1] }, // already has answers: ignored
      { questionId: "nope", correct: [0] },
    ],
  });
  const offered = answerSuggestions(p, plan);
  expect(offered.map((a) => [a.question.id, a.correct])).toEqual([["q1", [1]]]);
  const none = { pages: new Set<string>(), activities: new Set<number>() };
  const untouched = applyDesign(p, plan, none);
  const q1 = (untouched.slides.find((s) => s.id === "s-quiz") as Quiz).data
    .questions[0];
  expect(q1.answerUnknown).toBe(true);
  // No explanation is added for an answer nobody confirmed.
  expect(q1.explanation).toBe("");
  const accepted = applyDesign(p, plan, { ...none, answers: new Set(["q1"]) });
  const fixed = (accepted.slides.find((s) => s.id === "s-quiz") as Quiz).data
    .questions;
  expect(fixed[0].answerUnknown).toBeUndefined();
  expect(fixed[0].correctAnswerIndex).toBe(1);
  expect(fixed[0].explanation).toBe("Phải tắt máy đúng cách.");
  expect(fixed[1].correctAnswerIndexes).toEqual([0, 1]);
});

it("never suggests 'all options' for a choice question", () => {
  const p = unknownLesson();
  const plan = designPlanSchema.parse({
    ...aiPlan,
    answers: [{ questionId: "q1", correct: [0, 1] }],
  });
  expect(answerSuggestions(p, plan)).toEqual([]);
});
