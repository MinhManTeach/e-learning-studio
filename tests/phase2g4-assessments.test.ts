import { expect, it } from "vitest";
import { periodAnalysis } from "./support/phase2g4Fixture";
import { confirmPeriods } from "../src/blueprint/periods";
import { confirmedSourceQuestion as question } from "./support/phase2g4Fixture";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { outcomeCatalog } from "../src/blueprint/model";
import { sourceQuestion } from "../src/generation/sourceQuestions";
it("integrates a confirmed source question and its exact key and feedback", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1", "p2"], 2, 35);
  a.assessments = [question()];
  const b = await new DeterministicLessonBlueprintProvider().generate(a);
  expect(b.proposedSlides.filter((s) => s.type === "QUIZ")).toHaveLength(1);
  const p = await new DeterministicLessonGenerationProvider().generate(b, {
    projectId: "p",
    now: new Date().toISOString(),
    outcomes: outcomeCatalog(a),
  });
  const q = p.slides.flatMap((s) =>
    s.type === "quiz" ? s.data.questions : [],
  )[0];
  expect(q.prompt).toBe(question().prompt);
  expect(q.options.map((o) => o.text)).toEqual(["Nháy chuột", "Rút điện"]);
  expect(q.correctAnswerIndex).toBe(0);
  expect(q.explanation).toBe(question().feedback);
  expect(p.schemaVersion).toBe("2.2");
});
it.each(["NEEDS_TEACHER_REVIEW", "EXCLUDED"] as const)(
  "does not fabricate fallback quizzes for %s source questions",
  async (status) => {
    const a = confirmPeriods(periodAnalysis(), ["p1"], 1, 35);
    a.assessments = [{ ...question(), reviewStatus: status }];
    const b = await new DeterministicLessonBlueprintProvider().generate(a);
    expect(b.assessmentPlan.targetQuestionCount).toBe(0);
    expect(b.proposedSlides.some((s) => s.type === "QUIZ")).toBe(false);
  },
);
it("excludes unsupported types and items outside selection; accepts explicit assignment", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1"], 1, 35);
  a.assessments = [
    { ...question(), id: "outside", periodId: "p3", activityId: "a3" },
    { ...question(), id: "unsupported", type: "SHORT_ANSWER" },
  ];
  let b = await new DeterministicLessonBlueprintProvider().generate(a);
  expect(b.assessmentPlan.targetQuestionCount).toBe(0);
  expect(b.warnings.some((w) => w.code === "ASSESSMENT_UNSUPPORTED")).toBe(
    true,
  );
  a.periodReview!.assignedAssessmentIds = ["outside"];
  b = await new DeterministicLessonBlueprintProvider().generate(a);
  expect(b.assessmentPlan.targetQuestionCount).toBe(1);
});
it("refuses unresolved or ambiguous answer keys and preserves missing feedback", () => {
  const q = question();
  q.answer!.status = "NEEDS_TEACHER_REVIEW";
  expect(sourceQuestion(q, "x")).toBeNull();
  q.answer!.status = "TEACHER_CONFIRMED";
  q.answer!.value = "A, B";
  expect(sourceQuestion(q, "x")).toBeNull();
  q.answer!.value = "A";
  q.feedback = "";
  expect(sourceQuestion(q, "x")?.explanation).toBe("");
});
