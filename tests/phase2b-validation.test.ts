import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan, importPlanFile } from "../src/import/documents";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import {
  lessonBlueprintSchema,
  outcomeCatalog,
  type LessonBlueprint,
} from "../src/blueprint/model";
import {
  density,
  contentChunks,
  mapActivityStage,
} from "../src/blueprint/design";
import {
  refreshPlans,
  validateLessonBlueprint,
} from "../src/blueprint/validation";
import { editAnalysis } from "../src/import/review";

async function setup() {
  const source = readFileSync(
    "tests/fixtures/phase2a3-semantic-failure.txt",
    "utf8",
  );
  let a = await new DeterministicLessonAnalysisProvider().analyze(
    importPastedPlan(source),
  );
  // This is the known Phase 2A.3 semantic-failure fixture. Reproduce a teacher's
  // confirmed corrections instead of pretending the basic parser understood it.
  a = editAnalysis(
    a,
    "learningOutcomes",
    source
      .split(/\r?\n/)
      .filter((line) => line.startsWith("- "))
      .slice(0, 2)
      .map((line) => line.slice(2)),
  );
  a = editAnalysis(a, "aiIntegration", [
    source.split(/\r?\n/).find((line) => line.includes("5.A1.1"))!,
  ]);
  const b = await new DeterministicLessonBlueprintProvider().generate(a);
  return { a, b };
}
describe("Phase 2B validation and pedagogical heuristics", () => {
  it.each([
    ["version", (b: LessonBlueprint) => ({ ...b, version: "2.0" })],
    [
      "slide type",
      (b: LessonBlueprint) => ({
        ...b,
        proposedSlides: [{ ...b.proposedSlides[0], type: "UNKNOWN" }],
      }),
    ],
    [
      "stage",
      (b: LessonBlueprint) => ({
        ...b,
        proposedSlides: [{ ...b.proposedSlides[0], stage: "UNKNOWN" }],
      }),
    ],
    [
      "negative time",
      (b: LessonBlueprint) => ({
        ...b,
        proposedSlides: [{ ...b.proposedSlides[0], estimatedMinutes: -1 }],
      }),
    ],
    [
      "non-finite time",
      (b: LessonBlueprint) => ({
        ...b,
        proposedSlides: [
          { ...b.proposedSlides[0], estimatedMinutes: Infinity },
        ],
      }),
    ],
    [
      "media type",
      (b: LessonBlueprint) => ({
        ...b,
        proposedSlides: [
          {
            ...b.proposedSlides[0],
            mediaIntent: { type: "BINARY", purpose: "", required: true },
          },
        ],
      }),
    ],
  ])("rejects invalid %s at the schema boundary", async (_, mutate) => {
    const { a, b } = await setup();
    expect(lessonBlueprintSchema.safeParse(mutate(b)).success).toBe(false);
    expect(
      validateLessonBlueprint(mutate(b), a).some((w) => w.severity === "ERROR"),
    ).toBe(true);
  });
  it.each([
    [
      "DUPLICATE_ID",
      (b: LessonBlueprint) => {
        b.proposedSlides[1].id = b.proposedSlides[0].id;
      },
    ],
    [
      "ORDER",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].order = 99;
      },
    ],
    [
      "STAGES",
      (b: LessonBlueprint) => {
        b.stages[0].slideIds.push("dangling");
      },
    ],
    [
      "SOURCE",
      (b: LessonBlueprint) => {
        b.sourceAnalysisId = "other";
      },
    ],
    [
      "EMPTY_CONTENT",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].contentOutline = [];
      },
    ],
    [
      "MEDIA",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].mediaIntent = {
          type: "IMAGE",
          purpose: "",
          required: true,
        };
      },
    ],
    [
      "MEDIA_PLAN",
      (b: LessonBlueprint) => {
        b.mediaPlan.requiredSlideIds = ["missing"];
      },
    ],
    [
      "INTERACTION",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].interactionIntent = {
          type: "SHORT_PRACTICE",
          description: "",
        };
      },
    ],
    [
      "ASSESSMENT",
      (b: LessonBlueprint) => {
        b.assessmentPlan.targetQuestionCount = 0;
      },
    ],
    [
      "ASSESSMENT_COVERAGE",
      (b: LessonBlueprint) => {
        b.assessmentPlan.coverage[0].slideIds = ["missing"];
      },
    ],
    [
      "COMPLETION_STRUCTURE",
      (b: LessonBlueprint) => {
        b.proposedSlides.at(-1)!.type = "CONTENT";
      },
    ],
    [
      "TIME_BUDGET",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].estimatedMinutes = 100;
      },
    ],
    [
      "DENSITY",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].contentOutline = ["Một", "Hai", "Ba", "Bốn", "Năm"];
      },
    ],
    [
      "UNKNOWN_OUTCOME",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].sourceOutcomeIds = ["unknown"];
      },
    ],
    [
      "MEDIA_GENERIC",
      (b: LessonBlueprint) => {
        b.proposedSlides[0].mediaIntent = {
          type: "IMAGE",
          purpose: "Minh họa",
          searchQuery: "education image",
          required: false,
        };
      },
    ],
  ])(
    "detects %s without silently repairing teacher decisions",
    async (code, mutate) => {
      const { a, b } = await setup();
      mutate(b);
      const original = JSON.stringify(b);
      expect(validateLessonBlueprint(b, a).some((w) => w.code === code)).toBe(
        true,
      );
      expect(JSON.stringify(b)).toBe(original);
    },
  );
  it.each([
    ["Khởi động", "OPENING"],
    ["Khám phá", "DISCOVERY"],
    ["Hình thành kiến thức", "DISCOVERY"],
    ["Luyện tập", "PRACTICE"],
    ["Thực hành", "PRACTICE"],
    ["Câu hỏi", "ASSESSMENT"],
    ["Vận dụng", "APPLICATION"],
    ["Tổ chức", null],
  ])("maps %s using source evidence", (title, stage) => {
    expect(
      mapActivityStage({
        id: "activity",
        title,
        stage: null,
        content: [],
        estimatedMinutes: null,
        teacherActivity: [],
        studentActivity: [],
        goals: [],
        products: [],
        organization: [],
      }),
    ).toBe(stage);
  });
  it("splits conceptual density and merges short fragments, not by character count alone", () => {
    expect(contentChunks(["Một; Hai; Ba; Bốn; Năm"], 4, 3)).toEqual([
      ["Một", "Hai", "Ba"],
      ["Bốn", "Năm"],
    ]);
    expect(contentChunks(["Một", "Hai"], 4, 3)).toHaveLength(1);
    expect(contentChunks(["Một", "Hai"], 1, 1)).toHaveLength(2);
    expect(density(["Một", "Hai", "Ba", "Bốn"]).excessive).toBe(true);
    expect(density(["Nội dung ngắn"], 4).excessive).toBe(true);
    expect(density([Array(100).fill("từ").join(" ")]).excessive).toBe(true);
  });
  it("uses explicitly configured passing score and balanced coverage levels", async () => {
    const { a } = await setup();
    const b = await new DeterministicLessonBlueprintProvider({
      passingScore: 70,
    }).generate({
      ...a,
      learningOutcomes: [
        "Nhận biết nguồn tin",
        "Giải thích cách chọn",
        "Vận dụng tìm thông tin",
      ],
    });
    expect(b.assessmentPlan.targetPassingScore).toBe(70);
    expect(b.assessmentPlan.coverage.map((c) => c.level)).toEqual([
      "RECOGNITION",
      "UNDERSTANDING",
      "APPLICATION",
    ]);
  });
  it("covers the existing 5.A1.1 real lesson with meaningful media and responsibility activity", async () => {
    const { a, b } = await setup();
    expect(b.proposedSlides.length).toBeLessThan(14);
    for (const o of outcomeCatalog(a))
      expect(
        b.proposedSlides.some(
          (s) => s.type === "CONTENT" && s.sourceOutcomeIds.includes(o.id),
        ),
      ).toBe(true);
    const responsibility = b.proposedSlides.find((s) => s.type === "SCENARIO")!;
    expect(responsibility.contentOutline.join(" ")).toContain("5.A1.1");
    expect(responsibility.mediaIntent?.visualDescription).toContain(
      "chịu trách nhiệm",
    );
    expect(b.durationSource).toBe("PROPOSED");
    expect(b.warnings.some((w) => w.code === "UNCOVERED_OUTCOME")).toBe(false);
    expect(b.proposedSlides.filter((s) => s.type === "QUIZ")).toHaveLength(1);
  });
  it("generates through the real DOCX extraction and analysis boundary", async () => {
    const bytes = readFileSync("src/fixtures/docx/real-lesson-ai.docx");
    const doc = await importPlanFile({
      name: "real-lesson-ai.docx",
      size: bytes.byteLength,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    } as File);
    const a = await new DeterministicLessonAnalysisProvider().analyze(doc);
    const b = await new DeterministicLessonBlueprintProvider().generate(a);
    expect(b.sourceAnalysisId).toBe(a.id);
    expect(
      validateLessonBlueprint(b, a).filter((w) => w.severity === "ERROR"),
    ).toEqual([]);
    expect(b.proposedSlides.length).toBeGreaterThan(6);
    expect(refreshPlans(b)).toEqual(b);
  });
});
