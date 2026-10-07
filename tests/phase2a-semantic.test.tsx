import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { importPastedPlan, importPlanFile } from "../src/import/documents";
import {
  LessonAnalysisService,
  SemanticLessonAnalysisProvider,
  defaultPersonalAiSettings,
} from "../src/import/analysisService";
import {
  buildSemanticAnalysisInput,
  normalizeSemanticAnalysis,
  confidenceDisposition,
  aiPedagogicalAnalysisResultSchema,
  aiAnalysisJsonSchema,
  type AiPedagogicalAnalysisResult,
  type AnalysisItem,
  type SemanticAnalysisInput,
} from "../src/import/semantic";
import { MockSemanticLessonAnalysisProvider } from "./support/MockSemanticLessonAnalysisProvider";
import { AnalysisReview } from "../src/import/AnalysisReview";
import { correctClassification } from "../src/import/review";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";

const doc = {
  ...importPastedPlan(
    "I. YÊU CẦU CẦN ĐẠT\nSau bài học này, HS sẽ:\nGiải thích được sự cần thiết, tầm quan trọng của việc thu thập và tìm kiếm thông tin trong giải quyết vấn đề.\nNhận thức về các công cụ tìm kiếm và cách sử dụng chúng hiệu quả.\nTích hợp AI (5.A1.1 - Con người chịu trách nhiệm): Kiểm tra kết quả AI.\n2. Năng lực.\nGiao tiếp và hợp tác",
  ),
  blocks: [
    {
      id: "b1",
      type: "HEADING" as const,
      level: 1,
      text: "I. YÊU CẦU CẦN ĐẠT",
      sourceOrder: 0,
    },
    {
      id: "b2",
      type: "PARAGRAPH" as const,
      text: "Sau bài học này, HS sẽ:",
      sourceOrder: 1,
    },
    {
      id: "b3",
      type: "LIST" as const,
      items: [
        "Giải thích được sự cần thiết, tầm quan trọng của việc thu thập và tìm kiếm thông tin trong giải quyết vấn đề.",
        "Nhận thức về các công cụ tìm kiếm và cách sử dụng chúng hiệu quả.",
      ],
      sourceOrder: 2,
    },
    {
      id: "b4",
      type: "PARAGRAPH" as const,
      text: "Tích hợp AI (5.A1.1 - Con người chịu trách nhiệm): Kiểm tra kết quả AI.",
      sourceOrder: 3,
    },
    {
      id: "b5",
      type: "HEADING" as const,
      level: 2,
      text: "2. Năng lực.",
      sourceOrder: 4,
    },
    {
      id: "b6",
      type: "PARAGRAPH" as const,
      text: "Giao tiếp và hợp tác",
      sourceOrder: 5,
    },
  ],
};
const item = (text: string, confidence = 0.95, id = "b3"): AnalysisItem => ({
  text,
  confidence,
  sourceBlockIds: [id],
  reasoningCode: "PARENT_SECTION_MATCH",
});
function response(): AiPedagogicalAnalysisResult {
  return {
    lessonIdentity: {},
    learningOutcomes: doc.blocks[2].items!.map((t) => item(t)),
    knowledgeObjectives: [],
    competencies: [item("Giao tiếp và hợp tác", 0.95, "b6")],
    qualities: [],
    teachingActivities: [],
    assessmentEvidence: [],
    digitalCompetencyIntegration: [],
    aiIntegration: [
      {
        ...item(doc.blocks[3].text!, 0.98, "b4"),
        reasoningCode: "EXPLICIT_AI_LABEL",
      },
    ],
    specialNeedsSupport: [],
    keyKnowledge: [],
    uncertainItems: [],
    warnings: [],
  };
}
describe("Phase 2A.2 semantic document boundary", () => {
  it("preserves heading hierarchy, ordered paragraphs, lists and IDs without flattening", () => {
    const input = buildSemanticAnalysisInput(doc);
    expect(input.blocks).toEqual(doc.blocks);
    expect(input.blocks[4].level).toBe(2);
    expect(input.blocks.map((b) => b.id)).toEqual([
      "b1",
      "b2",
      "b3",
      "b4",
      "b5",
      "b6",
    ]);
    input.blocks[0].text = "changed";
    expect(doc.blocks[0].text).toBe("I. YÊU CẦU CẦN ĐẠT");
    expect(input).not.toHaveProperty("rawText");
  });
  it("preserves actual DOCX tables, rows, cells, GV/HS headers and spans", async () => {
    const bytes = readFileSync("src/fixtures/docx/real-lesson-tables.docx");
    const document = await importPlanFile({
      name: "real.docx",
      size: bytes.length,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
    });
    const input = buildSemanticAnalysisInput(document);
    expect(input.blocks).toEqual(document.blocks);
    const tables = input.blocks.filter((b) => b.type === "TABLE");
    expect(tables).toHaveLength(5);
    expect(JSON.stringify(tables)).toContain("Hoạt động của GV");
    expect(JSON.stringify(tables)).toContain("Hoạt động của HS");
  });
  it("retains cell coordinates and merged cell structure", () => {
    const table = {
      id: "t",
      type: "TABLE" as const,
      sourceOrder: 6,
      table: {
        rows: [
          {
            cells: [
              {
                text: "GV",
                column: 0,
                colspan: 2,
                rowspan: 2,
                paragraphs: ["GV"],
              },
              { text: "HS", column: 2 },
            ],
          },
        ],
      },
    };
    expect(
      buildSemanticAnalysisInput({
        ...doc,
        blocks: [...doc.blocks, table],
      }).blocks.at(-1),
    ).toEqual(table);
  });
  it("exposes strict JSON output schema and rejects extra reasoning prose", () => {
    expect(aiAnalysisJsonSchema().type).toBe("object");
    expect(
      aiPedagogicalAnalysisResultSchema.safeParse({
        ...response(),
        chainOfThought: "private",
      }).success,
    ).toBe(false);
    expect(
      aiPedagogicalAnalysisResultSchema.safeParse({
        ...response(),
        learningOutcomes: [
          { ...item("x"), reasoningCode: "long arbitrary prose" },
        ],
      }).success,
    ).toBe(false);
  });
});
describe("Phase 2A.2 providers and confidence", () => {
  it("validates semantic output, uses whole-document context, preserves explicit AI and excludes structural lead-ins", async () => {
    const provider = new MockSemanticLessonAnalysisProvider(
      async (input: SemanticAnalysisInput) => {
        expect(input.blocks).toHaveLength(6);
        return response();
      },
    );
    const result = await new LessonAnalysisService(
      provider,
      undefined,
      true,
    ).analyze(doc);
    expect(result.aiStatus).toBe("DEVELOPMENT");
    expect(result.source).toBe("LOCAL");
    expect(result.analysis.learningOutcomes).toHaveLength(2);
    expect(result.analysis.competencies).toEqual(["Giao tiếp và hợp tác"]);
    expect(result.analysis.aiIntegration[0]).toContain("5.A1.1");
    expect(result.analysis.unmappedContent).toEqual([]);
    expect(result.analysis.curriculum).toBe("");
    expect(result.analysis.subject).toBe("");
  });
  it("shows AI source only for a non-development connection", async () => {
    const provider = new SemanticLessonAnalysisProvider({
      id: "adapter-test",
      name: "Test connection",
      analyze: async () => response(),
    });
    const result = await new LessonAnalysisService(provider).analyze(doc);
    expect(result.source).toBe("AI");
    expect(result.aiStatus).toBe("CONNECTED");
  });
  it.each([
    null,
    { learningOutcomes: [] },
    { ...response(), learningOutcomes: [item("invalid", 1.5)] },
  ])("malformed AI output falls back safely: %j", async (value) => {
    const result = await new LessonAnalysisService(
      new MockSemanticLessonAnalysisProvider(value),
      undefined,
      true,
    ).analyze(doc);
    expect(result.source).toBe("LOCAL");
    expect(result.fallbackReason).toBe("UNAVAILABLE_OR_INVALID");
  });
  it("unavailable AI uses deterministic fallback without logging provider errors", async () => {
    const logging = vi.spyOn(console, "error");
    const result = await new LessonAnalysisService(
      new MockSemanticLessonAnalysisProvider(async () => {
        throw new Error("secret-bearing vendor error");
      }),
      undefined,
      true,
    ).analyze(doc);
    expect(result.aiStatus).toBe("UNAVAILABLE");
    expect(logging).not.toHaveBeenCalled();
    logging.mockRestore();
  });
  it("unconfigured production is honestly local; development provider is not invoked", async () => {
    const call = vi.fn(async () => response());
    const result = await new LessonAnalysisService(
      new MockSemanticLessonAnalysisProvider(call),
      undefined,
      false,
    ).analyze(doc);
    expect(call).not.toHaveBeenCalled();
    expect(result.aiStatus).toBe("NOT_CONNECTED");
    expect(defaultPersonalAiSettings).toEqual({
      providerId: null,
      model: null,
      connectionStatus: "NOT_CONNECTED",
    });
  });
  it.each([
    [0.59, "UNCERTAIN"],
    [0.6, "REVIEW"],
    [0.84, "REVIEW"],
    [0.85, "ACCEPT"],
    [1, "ACCEPT"],
  ] as const)("applies confidence boundary %s", (score, expected) =>
    expect(confidenceDisposition(score)).toBe(expected),
  );
  it("accepts medium/high confidence, isolates low confidence with editable indexed provenance", () => {
    const result = response();
    result.learningOutcomes = [
      item("low", 0.59),
      item("medium", 0.7),
      item("high", 0.95),
    ];
    const a = normalizeSemanticAnalysis(result, doc);
    expect(a.learningOutcomes).toEqual(["medium", "high"]);
    expect(a.unmappedContent).toEqual(["low"]);
    expect(a.classifications[0]).toMatchObject({
      field: "unmappedContent[0]",
      needsReview: true,
    });
    expect(a.sourceTraces[0].blockId).toBe("b3");
    expect(
      correctClassification(a, a.classifications[0].id, "KNOWLEDGE")
        .knowledgeObjectives,
    ).toEqual(["low"]);
    const html = renderToStaticMarkup(
      <AnalysisReview
        analysis={a}
        edit={() => {}}
        back={() => {}}
        reanalyze={() => {}}
        confirm={() => {}}
      />,
    );
    expect(html).toContain("Đã phân tích kế hoạch bài dạy");
    expect(html).toContain("Nên kiểm tra");
  });
  it("rejects fabricated source IDs instead of trusting model provenance", () => {
    const result = response();
    result.learningOutcomes = [item("invented", 0.99, "absent")];
    expect(() => normalizeSemanticAnalysis(result, doc)).toThrow("khối nguồn");
  });
  it("headings cannot become uncertain content", () => {
    const result = response();
    result.uncertainItems = [item("2. Năng lực.", 0.1, "b5")];
    expect(normalizeSemanticAnalysis(result, doc).unmappedContent).toEqual([]);
  });
  it("local structural hints preserve the objective lead-in and punctuation in competency headings", async () => {
    const source = {
      ...doc,
      sourceType: "DOCX" as const,
      blocks: doc.blocks.map((b) =>
        b.type === "LIST" ? { ...b, text: b.items!.join("\n") } : b,
      ),
    };
    const a = await new DeterministicLessonAnalysisProvider().analyze(source);
    expect(a.learningOutcomes.join(" ")).toContain("Giải thích được");
    expect(a.competencies).toEqual(["Giao tiếp và hợp tác"]);
    expect(a.aiIntegration[0]).toContain("5.A1.1");
    expect(a.unmappedContent).toEqual([]);
    const result = response();
    result.uncertainItems = [item("Sau bài học này, HS sẽ:", 0.1, "b2")];
    expect(normalizeSemanticAnalysis(result, doc).unmappedContent).toEqual([]);
  });
  it("preserves activities and separate teacher/student content", () => {
    const result = response();
    result.teachingActivities = [
      {
        title: item("Khởi động", 0.95, "b1"),
        stage: "OPENING",
        estimatedMinutes: 5,
        content: [item("Nội dung")],
        teacherActivity: [item("GV hướng dẫn")],
        studentActivity: [item("HS thực hiện")],
        goals: [],
        products: [],
        organization: [],
      },
    ];
    const a = normalizeSemanticAnalysis(result, doc);
    expect(a.teachingActivities[0].teacherActivity).toEqual(["GV hướng dẫn"]);
    expect(a.teachingActivities[0].studentActivity).toEqual(["HS thực hiện"]);
  });
  it("aborted requests never fall back or return late results", async () => {
    const controller = new AbortController();
    const provider = new MockSemanticLessonAnalysisProvider(async () => {
      controller.abort();
      return response();
    });
    await expect(
      new LessonAnalysisService(provider, undefined, true).analyze(doc, {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
