import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  LessonAnalysisService,
  SemanticLessonAnalysisProvider,
} from "../src/import/analysisService";
import {
  LocalServerSemanticConnection,
  readLocalAiStatus,
} from "../src/import/localAiConnection";
import { importPastedPlan, importPlanFile } from "../src/import/documents";
import {
  buildSemanticAnalysisInput,
  normalizeSemanticAnalysis,
  type AiPedagogicalAnalysisResult,
} from "../src/import/semantic";
import { serializeAnalysis } from "../src/import/model";
import { createSampleProject } from "../src/fixtures/sampleLesson";
import { exportProjectJSON } from "../src/model/json";

const document = importPastedPlan(
  readFileSync("tests/fixtures/phase2a3-semantic-failure.txt", "utf8"),
);
function response(doc = document): AiPedagogicalAnalysisResult {
  const blocks = buildSemanticAnalysisInput(doc).blocks;
  const item = (fragment: string) => {
    const block = blocks.find((b) => JSON.stringify(b).includes(fragment))!;
    const text = block.items?.find((t) => t.includes(fragment)) ?? block.text!;
    return {
      text,
      sourceBlockIds: [block.id],
      confidence: 0.94,
      reasoningCode: "SEMANTIC_CLASSIFICATION" as const,
    };
  };
  return {
    lessonIdentity: {},
    learningOutcomes: [item("Giải thích được"), item("Nhận thức")],
    knowledgeObjectives: [],
    competencies: [item("Giao tiếp")],
    qualities: [],
    teachingActivities: [],
    assessmentEvidence: [],
    digitalCompetencyIntegration: [],
    aiIntegration: [{ ...item("5.A1.1"), reasoningCode: "EXPLICIT_AI_LABEL" }],
    specialNeedsSupport: [],
    keyKnowledge: [],
    uncertainItems: [],
    warnings: [],
  };
}
const service = (transport: typeof fetch, timeout?: number) =>
  new LessonAnalysisService(
    new SemanticLessonAnalysisProvider(
      new LocalServerSemanticConnection(transport, timeout),
    ),
  );
describe("Phase 2A.3 whole document pipeline", () => {
  it("classifies the real failure fixture through the real HTTP connection boundary", async () => {
    const result = await service(
      async () => new Response(JSON.stringify(response())),
    ).analyze(document);
    expect(result.source).toBe("AI");
    expect(result.analysis.learningOutcomes).toHaveLength(2);
    expect(result.analysis.competencies).toHaveLength(1);
    expect(result.analysis.aiIntegration[0]).toContain("5.A1.1");
    expect(result.analysis.unmappedContent).toEqual([]);
    expect(
      result.analysis.classifications.every(
        (c) =>
          !c.sourceText.includes("HS sẽ:") && c.sourceText !== "2. Năng lực.",
      ),
    ).toBe(true);
    expect(
      result.analysis.sourceTraces.every((t) =>
        document.blocks.some((b) => b.id === t.blockId),
      ),
    ).toBe(true);
  });
  it.each(["malformed", "schema", "provenance", "network", "rate-limit"])(
    "falls back safely after %s failure",
    async (failure) => {
      const invalid = response();
      invalid.learningOutcomes[0].sourceBlockIds = ["missing"];
      const result = await service(async () => {
        if (failure === "network") throw new Error("network");
        return failure === "rate-limit"
          ? new Response("", { status: 429 })
          : new Response(
              failure === "malformed"
                ? "bad JSON"
                : JSON.stringify(failure === "schema" ? {} : invalid),
            );
      }).analyze(document);
      expect(result.source).toBe("LOCAL");
      expect(result.aiStatus).toBe("UNAVAILABLE");
      expect(result.fallbackReason).toBe("UNAVAILABLE_OR_INVALID");
      expect(document.rawText).toContain("5.A1.1");
    },
  );
  it("uses basic mode without any configuration or key", async () => {
    const result = await new LessonAnalysisService().analyze(document);
    expect(result).toMatchObject({
      source: "LOCAL",
      aiStatus: "NOT_CONNECTED",
    });
  });
  it("falls back after client timeout", async () => {
    const result = await service(
      async (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            { once: true },
          ),
        ),
      5,
    ).analyze(document);
    expect(result.source).toBe("LOCAL");
  });
  it("ignores late semantic results after cancellation", async () => {
    let finish!: (response: Response) => void;
    const controller = new AbortController();
    const pending = service(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ).analyze(document, { signal: controller.signal });
    controller.abort();
    finish(new Response(JSON.stringify(response())));
    await expect(pending).rejects.toThrow();
  });
  it("retries successfully after an unavailable provider", async () => {
    let unavailable = true;
    const retryService = service(async () =>
      unavailable
        ? new Response("", { status: 502 })
        : new Response(JSON.stringify(response())),
    );
    expect((await retryService.analyze(document)).source).toBe("LOCAL");
    unavailable = false;
    expect((await retryService.analyze(document)).source).toBe("AI");
  });
  it.each([0.59, 0.6, 0.84, 0.85])(
    "normalizes confidence %s with indexed source trace",
    (score) => {
      const raw = response();
      raw.learningOutcomes[0].confidence = score;
      const result = normalizeSemanticAnalysis(raw, document);
      const classification = result.classifications.find((c) =>
        c.sourceText.includes("Giải thích được"),
      )!;
      expect(classification.confidence).toBe(score);
      expect(classification.needsReview).toBe(score < 0.6);
      expect(
        result.sourceTraces.some(
          (t) => t.blockId === raw.learningOutcomes[0].sourceBlockIds[0],
        ),
      ).toBe(true);
    },
  );
  it("lowers claimed confidence when section evidence conflicts", () => {
    const raw = response();
    raw.qualities = [{ ...raw.competencies[0], confidence: 0.99 }];
    raw.competencies = [];
    const result = normalizeSemanticAnalysis(raw, document);
    expect(
      result.classifications.find((c) => c.category === "QUALITY")!.confidence,
    ).toBeLessThan(0.85);
  });
  it("sends current DOCX tables and GV/HS relationships intact", async () => {
    const bytes = readFileSync("src/fixtures/docx/real-lesson-tables.docx");
    const doc = await importPlanFile({
      name: "real.docx",
      size: bytes.length,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
    });
    let payload = "";
    await service(async (_url, init) => {
      payload = init!.body as string;
      return new Response("{}");
    }).analyze(doc);
    const sent = JSON.parse(payload);
    expect(sent.blocks).toEqual(doc.blocks);
    expect(payload).toContain("Hoạt động của GV");
    expect(payload).toContain("Hoạt động của HS");
    expect(sent).not.toHaveProperty("rawText");
    expect(sent).not.toHaveProperty("fileName");
  });
  it("serializes lesson and analysis without configuration secrets", () => {
    const result = normalizeSemanticAnalysis(response(), document);
    expect(serializeAnalysis(result)).not.toMatch(
      /apiKey|Authorization|LESSON_AI_API_KEY/,
    );
    expect(exportProjectJSON(createSampleProject())).not.toMatch(
      /apiKey|Authorization|LESSON_AI_API_KEY/,
    );
  });
  it("reports unavailable local status without inventing a connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>")),
    );
    try {
      expect(await readLocalAiStatus()).toMatchObject({
        configured: false,
        status: "NOT_CONNECTED",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
