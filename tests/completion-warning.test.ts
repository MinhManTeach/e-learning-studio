import { describe, expect, it } from "vitest";
import { createProject, createSlide } from "../src/model/factories";
import { consistencyWarnings } from "../src/model/analysis";

describe("Completion consistency warning", () => {
  const code = "REQUIRE_QUIZ_WITHOUT_QUIZ";
  it("warns when a quiz is required but the lesson has no quiz slide", () => {
    const p = createProject();
    expect(p.settings.requireQuiz).toBe(true);
    expect(consistencyWarnings(p).map((w) => w.code)).toContain(code);
  });
  it("clears once a quiz exists or the requirement is turned off", () => {
    const withQuiz = createProject();
    withQuiz.slides.push(createSlide("quiz"));
    expect(consistencyWarnings(withQuiz).map((w) => w.code)).not.toContain(
      code,
    );
    const optional = createProject();
    optional.settings.requireQuiz = false;
    expect(consistencyWarnings(optional).map((w) => w.code)).not.toContain(
      code,
    );
  });
});
