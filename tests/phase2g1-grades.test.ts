import { it, expect } from "vitest";
import { importPastedPlan } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import {
  analysisWarnings,
  confirmAnalysis,
  editAnalysis,
} from "../src/import/review";
import { gradeEvidence, canPlanForGrade } from "../src/import/grades";
async function input(text: string) {
  const document = importPastedPlan(text);
  return {
    document,
    analysis: await new DeterministicLessonAnalysisProvider().analyze(document),
    confirmedAt: null,
  };
}
it("keeps both grades unknown with no implicit grade 4 or comparable mismatch", async () => {
  const { analysis: a } = await input("Bài 7: Một bài học.");
  expect(gradeEvidence(a, "curriculumGrade")).toMatchObject({
    value: "",
    source: "UNKNOWN",
    confirmed: false,
  });
  expect(canPlanForGrade(a)).toBe(false);
  expect(analysisWarnings(a).some((x) => x.code === "GRADE_MISMATCH")).toBe(
    false,
  );
});
it("records explicit source declaration without treating extraction as teacher confirmation", async () => {
  const { analysis: a } = await input("Lớp: 3\nLớp học sinh: 5");
  expect(gradeEvidence(a, "curriculumGrade")).toMatchObject({
    value: "3",
    source: "DOCUMENT",
    confirmed: false,
  });
  expect(analysisWarnings(a).some((x) => x.code === "GRADE_MISMATCH")).toBe(
    false,
  );
});
it("warns only after teacher confirmation of two comparable current values", async () => {
  const d = await input("Lớp: 3\nLớp học sinh: 5");
  const a = confirmAnalysis(d, true).analysis;
  expect(gradeEvidence(a, "targetAudienceGrade").confirmed).toBe(true);
  expect(analysisWarnings(a).some((x) => x.code === "GRADE_MISMATCH")).toBe(
    true,
  );
  expect(canPlanForGrade(a)).toBe(true);
});
it("records a teacher edit independently and invalidates confirmation on change", async () => {
  const d = await input("Lớp: 3\nLớp học sinh: 5");
  const a = editAnalysis(
    confirmAnalysis(d, true).analysis,
    "targetAudienceGrade",
    "4",
  );
  expect(gradeEvidence(a, "targetAudienceGrade")).toMatchObject({
    value: "4",
    source: "TEACHER",
    confirmed: false,
  });
  expect(canPlanForGrade(a)).toBe(false);
  expect(analysisWarnings(a).some((x) => x.code === "GRADE_MISMATCH")).toBe(
    false,
  );
});
it("does not compare invalid or legacy unconfirmed values", async () => {
  const { analysis: a } = await input("Bài học");
  expect(
    analysisWarnings({
      ...a,
      curriculumGrade: "lớp nhỏ",
      targetAudienceGrade: "5",
    }).some((x) => x.code === "GRADE_MISMATCH"),
  ).toBe(false);
});

import { normalizeSemanticAnalysis } from "../src/import/semantic";
it.each([
  ["Bài: Kiểm thử", ""],
  ["Lớp: 3", "3"],
])(
  "requires explicit source evidence even when an AI provider supplies a grade: %s",
  (text, expected) => {
    const document = importPastedPlan(text);
    const a = normalizeSemanticAnalysis(
      {
        lessonIdentity: { curriculumGrade: 5, targetAudienceGrade: 4 },
        learningOutcomes: [],
        knowledgeObjectives: [],
        competencies: [],
        qualities: [],
        teachingActivities: [],
        assessmentEvidence: [],
        digitalCompetencyIntegration: [],
        aiIntegration: [],
        specialNeedsSupport: [],
        keyKnowledge: [],
        uncertainItems: [],
        warnings: [],
      },
      document,
    );
    expect(a.curriculumGrade).toBe(expected);
    expect(a.targetAudienceGrade).toBe("");
    if (expected)
      expect(gradeEvidence(a, "curriculumGrade").source).toBe("DOCUMENT");
  },
);
