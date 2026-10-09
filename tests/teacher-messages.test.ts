import { describe, expect, it } from "vitest";
import { periodAnalysis } from "./support/phase2g4Fixture";
import { generationFixture } from "./support/phase2cFixture";
import { confirmPeriods } from "../src/blueprint/periods";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";

describe("messages shown to teachers and students", () => {
  it("names periods as 'Tiết N' instead of internal IDs in blueprint warnings", async () => {
    const a = confirmPeriods(periodAnalysis(), ["p1", "p3"], 2, 35);
    const b = await new DeterministicLessonBlueprintProvider().generate(a);
    const period = b.warnings.filter((w) => w.code === "PERIOD_TIME");
    expect(period.map((w) => w.message).join(" ")).toMatch(/Tiết 1.*Tiết 3/);
    for (const w of period) expect(w.message).not.toMatch(/\bp[13]\b/);
  });
  it("does not promise a quiz retry on the completion page of a lesson without a quiz", async () => {
    const { b, context } = await generationFixture();
    const noQuiz = {
      ...b,
      proposedSlides: b.proposedSlides.filter((s) => s.type !== "QUIZ"),
      assessmentPlan: { ...b.assessmentPlan, targetQuestionCount: 0 },
    };
    const p = await new DeterministicLessonGenerationProvider().generate(
      noQuiz,
      context,
    );
    const completion = p.slides.find((s) => s.type === "completion");
    expect(
      completion?.type === "completion" && completion.data.message,
    ).not.toMatch(/bài kiểm tra/);
    const withQuiz = await new DeterministicLessonGenerationProvider().generate(
      b,
      context,
    );
    const done = withQuiz.slides.find((s) => s.type === "completion");
    expect(done?.type === "completion" && done.data.message).toMatch(
      /bài kiểm tra/,
    );
  });
});
