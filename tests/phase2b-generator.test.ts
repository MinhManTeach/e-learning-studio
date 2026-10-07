import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan } from "../src/import/documents";
import {
  DeterministicLessonBlueprintProvider,
  LessonBlueprintGenerator,
} from "../src/blueprint/generator";
import { lessonBlueprintSchema, outcomeCatalog } from "../src/blueprint/model";
import { validateLessonBlueprint } from "../src/blueprint/validation";

export async function lesson() {
  const a = await new DeterministicLessonAnalysisProvider().analyze(
    importPastedPlan(readFileSync("src/fixtures/lesson-plan-vi.txt", "utf8")),
  );
  a.id = "confirmed-test";
  return a;
}
describe("Phase 2B deterministic design", () => {
  it("requires teacher confirmation at the workflow boundary", async () => {
    const analysis = await lesson();
    await expect(
      new LessonBlueprintGenerator().generate({ analysis, confirmedAt: null }),
    ).rejects.toThrow(/xác nhận/);
  });
  it("produces a versioned stable blueprint without network calls or mutating analysis", async () => {
    const analysis = await lesson();
    const before = JSON.stringify(analysis);
    const network = vi.spyOn(globalThis, "fetch");
    const provider = new DeterministicLessonBlueprintProvider();
    const b = await provider.generate(analysis);
    expect(await provider.generate(analysis)).toEqual(b);
    expect(lessonBlueprintSchema.parse(b)).toEqual(b);
    expect(JSON.stringify(analysis)).toBe(before);
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
    expect(b.proposedSlides.length).toBeGreaterThanOrEqual(10);
    expect(b.proposedSlides.length).toBeLessThanOrEqual(16);
    expect(
      validateLessonBlueprint(b, analysis).filter(
        (w) => w.severity === "ERROR",
      ),
    ).toEqual([]);
  });
  it.each([25, 35, 45])(
    "allocates the exact %i minute budget",
    async (minutes) => {
      const analysis = { ...(await lesson()), durationMinutes: minutes };
      const b = await new DeterministicLessonBlueprintProvider().generate(
        analysis,
      );
      expect(
        b.proposedSlides.reduce((n, s) => n + s.estimatedMinutes, 0),
      ).toBeCloseTo(minutes, 1);
    },
  );
  it("varies slide count with knowledge, activities, age and time rather than padding", async () => {
    const a = await lesson();
    const p = new DeterministicLessonBlueprintProvider();
    const small = await p.generate({
      ...a,
      durationMinutes: 25,
      keyKnowledge: ["Phân biệt thông tin"],
      teachingActivities: [],
    });
    const large = await p.generate({
      ...a,
      durationMinutes: 45,
      keyKnowledge: Array.from(
        { length: 15 },
        (_, i) =>
          `Khái niệm ${i}: giải thích và phân loại thông tin trong đời sống`,
      ),
    });
    expect(large.proposedSlides.length).toBeGreaterThan(
      small.proposedSlides.length,
    );
    expect(
      large.proposedSlides
        .filter((s) => s.type === "CONTENT")
        .every((s) => s.contentOutline.length <= 3),
    ).toBe(true);
  });
  it("marks inferred duration and covers meaningful outcomes through learning experiences", async () => {
    const a = { ...(await lesson()), durationMinutes: null };
    const b = await new DeterministicLessonBlueprintProvider().generate(a);
    expect(b.durationSource).toBe("PROPOSED");
    for (const o of outcomeCatalog(a))
      expect(
        b.proposedSlides.some(
          (s) =>
            !["OBJECTIVES", "SUMMARY"].includes(s.type) &&
            s.sourceOutcomeIds.includes(o.id),
        ),
      ).toBe(true);
    expect(b.assessmentPlan.targetPassingScore).toBe(80);
    expect(b.assessmentPlan.targetQuestionCount).toBeGreaterThan(0);
    expect(b.proposedSlides.at(-1)?.type).toBe("COMPLETION");
  });
  it("embeds AI, digital and accessibility meaning without decorative slides", async () => {
    const a = {
      ...(await lesson()),
      aiIntegration: [
        "5.A1.1 — Con người chịu trách nhiệm với thông tin sử dụng",
      ],
      digitalCompetencyIntegration: ["Đối chiếu nguồn thông tin"],
      specialNeedsSupport: ["Không giới hạn thời gian, dùng gợi ý bằng hình"],
    };
    const b = await new DeterministicLessonBlueprintProvider().generate(a);
    const integrated = b.proposedSlides.filter((s) =>
      s.contentOutline.some((x) => x.includes("chịu trách nhiệm")),
    );
    expect(integrated.length).toBeGreaterThan(0);
    expect(
      integrated.every((s) => ["SCENARIO", "CONTENT", "QUIZ"].includes(s.type)),
    ).toBe(true);
    expect(JSON.stringify(b)).toContain("Đối chiếu nguồn");
    expect(b.accessibilityPlan.sourceSupport).toEqual(a.specialNeedsSupport);
    expect(b.proposedSlides.some((s) => s.title.includes("HSKT"))).toBe(false);
    expect(
      b.proposedSlides
        .filter((s) => s.mediaIntent?.required)
        .every((s) => (s.mediaIntent?.visualDescription ?? "").includes("lớp")),
    ).toBe(true);
  });
  it("does not invent scenario, assessment, or unsupported discovery stages for sparse input", async () => {
    const a = {
      ...(await lesson()),
      learningOutcomes: [],
      knowledgeObjectives: [],
      keyKnowledge: [],
      teachingActivities: [],
      aiIntegration: [],
      digitalCompetencyIntegration: [],
      assessmentEvidence: [],
      safetyTopics: [],
    };
    const b = await new DeterministicLessonBlueprintProvider().generate(a);
    expect(
      b.proposedSlides.some((s) => s.type === "SCENARIO" || s.type === "QUIZ"),
    ).toBe(false);
    expect(b.stages.some((s) => s.stage === "DISCOVERY")).toBe(false);
    expect(b.warnings.some((w) => w.code === "MISSING_CONTENT")).toBe(true);
  });
});
