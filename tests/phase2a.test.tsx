import { describe, it, expect } from "vitest";
import fixture from "../src/fixtures/lesson-plan-vi.txt?raw";
import { renderToStaticMarkup } from "react-dom/server";
import {
  importPastedPlan,
  importPlanFile,
  importLimits,
  supportedPlanFormats,
} from "../src/import/documents";
import {
  DeterministicLessonAnalysisProvider,
  normalizeHeading,
  parseDuration,
  parseGrade,
  analysisSteps,
} from "../src/import/analyzer";
import {
  analysisSchema,
  blueprintSchema,
  serializeAnalysis,
  deserializeAnalysis,
  type LessonAnalysisProvider,
} from "../src/import/model";
import {
  analysisWarnings,
  editAnalysis,
  confirmAnalysis,
} from "../src/import/review";
import { AnalysisReview, reviewGroups } from "../src/import/AnalysisReview";
import { createSampleProject } from "../src/fixtures/sampleLesson";
import { exportProjectJSON } from "../src/model/json";
const provider = new DeterministicLessonAnalysisProvider();
const analyze = (text: string) => provider.analyze(importPastedPlan(text));
function file(name: string, text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
}

describe("Phase 2A document import", () => {
  it("imports pasted text with separate identity and raw source", () => {
    const doc = importPastedPlan("Môn: Toán\r\nLớp: 3");
    expect(doc.sourceType).toBe("PASTE");
    expect(doc.rawText).toBe("Môn: Toán\nLớp: 3");
    expect(doc.id).toBeTruthy();
    expect(Date.parse(doc.importedAt)).not.toBeNaN();
  });
  it("gives new imports independent IDs", () =>
    expect(importPastedPlan(fixture).id).not.toBe(
      importPastedPlan(fixture).id,
    ));
  it.each(["", " \n\t"])("rejects empty pasted source %j", (value) =>
    expect(() => importPastedPlan(value)).toThrow("chưa có nội dung"),
  );
  it("limits pasted document length", () =>
    expect(() =>
      importPastedPlan("x".repeat(importLimits.maxCharacters + 1)),
    ).toThrow("quá dài"));
  it("imports TXT UTF-8 with BOM and normalizes CRLF", async () => {
    const doc = await importPlanFile(
      file("bài dạy.TXT", "\uFEFFMôn: Tiếng Việt\r\nLớp: 2"),
    );
    expect(doc).toMatchObject({
      sourceType: "TXT",
      fileName: "bài dạy.TXT",
      rawText: "Môn: Tiếng Việt\nLớp: 2",
    });
  });
  it.each(["DOCX", "PDF"])(
    "rejects invalid DOCX or unimplemented PDF (%s)",
    async (ext) =>
      expect(
        importPlanFile(file("plan." + ext, "fake content")),
      ).rejects.toThrow(ext === "PDF" ? "sắp hỗ trợ" : "Không đọc được DOCX"),
  );
  it("rejects unknown file extension", async () =>
    expect(importPlanFile(file("plan.exe", "text"))).rejects.toThrow(
      "chưa được hỗ trợ",
    ));
  it("rejects oversized file before reading", async () => {
    let read = false;
    await expect(
      importPlanFile({
        name: "plan.txt",
        size: importLimits.maxBytes + 1,
        arrayBuffer: async () => {
          read = true;
          return new ArrayBuffer(0);
        },
      }),
    ).rejects.toThrow("quá lớn");
    expect(read).toBe(false);
  });
  it("rejects malformed UTF-8 instead of replacing characters", async () =>
    expect(
      importPlanFile({
        name: "bad.txt",
        size: 1,
        arrayBuffer: async () => new Uint8Array([255]).buffer,
      }),
    ).rejects.toThrow("UTF-8"));
  it("rejects binary null characters", () =>
    expect(() => importPastedPlan("Môn:\u0000Toán")).toThrow(
      "không phải văn bản",
    ));
  it("reports TXT and DOCX as implemented", () =>
    expect(
      supportedPlanFormats.filter((x) => x.supported).map((x) => x.extension),
    ).toEqual(["TXT", "DOCX"]));
});
describe("Vietnamese deterministic analyzer", () => {
  it("extracts complete fixture metadata without copying grade or title into missing fields", async () => {
    const a = await analyze(fixture);
    expect(a).toMatchObject({
      subject: "Tin học",
      curriculumGrade: "4",
      targetAudienceGrade: "",
      lessonTitle: "Thông tin trên Website",
      topic: "",
      durationMinutes: 35,
      curriculum: "GDPT 2018",
    });
  });
  it.each([
    "MÔN: Toán",
    "Môn học Toán",
    "I. Môn học: Toán",
    "Lĩnh vực: Toán",
    "  môn   học  :  Toán  ",
  ])("recognizes subject label %s", async (text) =>
    expect((await analyze(text)).subject).toBe("Toán"),
  );
  it.each(["LỚP: 4", "Khối 4", "Khối lớp: 4", "Lớp chương trình: 4"])(
    "recognizes grade label %s",
    async (text) => expect((await analyze(text)).curriculumGrade).toBe("4"),
  );
  it("handles metadata value on the next line with trace range", async () => {
    const a = await analyze("Môn học\nToán\nLớp\n3");
    expect(a.subject).toBe("Toán");
    expect(a.curriculumGrade).toBe("3");
    expect(a.sourceTraces[0]).toMatchObject({
      lineStart: 1,
      lineEnd: 2,
      sourceText: "Môn học\nToán",
    });
  });
  it.each([
    "YÊU CẦU CẦN ĐẠT",
    "I. Mục tiêu",
    "1. Mục tiêu bài học:",
    "I Yêu cầu cần đạt",
    "• Yêu cầu cần đạt:",
  ])("recognizes outcome heading %s", async (heading) =>
    expect(
      (await analyze(heading + "\n- Đếm được đến 10.")).learningOutcomes,
    ).toEqual(["Đếm được đến 10."]),
  );
  it("merges wrapped bullet lines and keeps separate bullets", async () => {
    const a = await analyze(fixture);
    expect(a.learningOutcomes).toEqual([
      "Nhận biết và phân biệt văn bản, hình ảnh, âm thanh và siêu liên kết.",
      "Giải thích sơ lược tác hại của việc truy cập website không phù hợp.",
    ]);
  });
  it("keeps knowledge distinct from learning outcomes", async () => {
    const a = await analyze(
      "Mục tiêu\n- Mục tiêu chung.\n1. Kiến thức\n- Kiến thức cụ thể.\nNội dung trọng tâm\n- Ý trọng tâm.",
    );
    expect(a.learningOutcomes).toEqual(["Mục tiêu chung."]);
    expect(a.knowledgeObjectives).toEqual(["Kiến thức cụ thể."]);
    expect(a.keyKnowledge).toEqual(["Ý trọng tâm."]);
  });
  it.each([
    "NĂNG LỰC",
    "II. Năng lực chung",
    "2. Năng lực đặc thù:",
    "Năng lực: Tự học.",
  ])("recognizes competencies %s", async (heading) =>
    expect(
      (
        await analyze(
          heading + (heading.includes("Tự học") ? "" : "\n- Tự học."),
        )
      ).competencies,
    ).toEqual(["Tự học."]),
  );
  it("extracts competencies and qualities from fixture", async () => {
    const a = await analyze(fixture);
    expect(a.competencies).toEqual([
      "Tự chủ và tự học.",
      "Giao tiếp và hợp tác.",
      "Giải quyết vấn đề.",
    ]);
    expect(a.qualities).toEqual(["Trung thực.", "Tự tin."]);
  });
  it("extracts AI code and wrapped description without external calls", async () =>
    expect((await analyze(fixture)).aiIntegration).toEqual([
      "4.B2.1 — Bảo vệ thông tin cá nhân khi sử dụng website và chatbot AI.",
    ]));
  it.each([
    "Tích hợp AI",
    "Trí tuệ nhân tạo",
    "Năng lực số",
    "Tích hợp năng lực số",
  ])("recognizes integration heading %s", async (heading) => {
    const a = await analyze(heading + ":\n- Nội dung tích hợp.");
    expect([...a.aiIntegration, ...a.digitalCompetencyIntegration]).toEqual([
      "Nội dung tích hợp.",
    ]);
  });
  it.each(["HSKT", "Học sinh khuyết tật", "Hỗ trợ học sinh đặc thù"])(
    "extracts special support under %s",
    async (heading) =>
      expect(
        (await analyze(heading + ":\nNhận biết thông tin chính."))
          .specialNeedsSupport,
      ).toEqual(["Nhận biết thông tin chính."]),
  );
  it("extracts five activities with source-derived stages", async () => {
    const a = await analyze(fixture);
    expect(a.teachingActivities.map((x) => x.stage)).toEqual([
      "OPENING",
      "DISCOVERY",
      "PRACTICE",
      "ASSESSMENT",
      "APPLICATION",
    ]);
    expect(a.teachingActivities[0].content).toEqual([
      "Học sinh kể những thông tin từng thấy trên website.",
    ]);
    expect(a.teachingActivities.every((x) => x.estimatedMinutes === null)).toBe(
      true,
    );
  });
  it("recognizes numbered activity header and explicit time", async () => {
    const a = await analyze(
      "Tiến trình dạy học\nHoạt động 1: Khởi động (5 phút)\n- Học sinh quan sát.",
    );
    expect(a.teachingActivities[0]).toMatchObject({
      stage: "OPENING",
      estimatedMinutes: 5,
      content: ["Học sinh quan sát."],
    });
  });
  it("retains unknown activity stage rather than inventing it", async () => {
    const a = await analyze(
      "Hoạt động dạy học\nQuan sát đồ vật\n- Học sinh trao đổi.",
    );
    expect(a.teachingActivities[0]).toMatchObject({
      title: "Quan sát đồ vật",
      stage: null,
    });
  });
  it("extracts assessment and explicit safety topics", async () => {
    const a = await analyze(
      "Đánh giá\n- Sản phẩm học tập.\nAn toàn\n- Giữ thông tin riêng tư.",
    );
    expect(a.assessmentEvidence).toEqual(["Sản phẩm học tập."]);
    expect(a.safetyTopics).toEqual(["Giữ thông tin riêng tư."]);
  });
  it("preserves unmapped equipment and unknown sections", async () => {
    const a = await analyze(
      "Kế hoạch của cô Mai\nThiết bị:\n- Bảng phụ.\nGhi chú khác:\n- Cần bổ sung ví dụ.",
    );
    expect(a.unmappedContent.join("\n")).toContain("Bảng phụ.");
    expect(a.unmappedContent.join("\n")).toContain("Cần bổ sung ví dụ.");
    expect(a.unmappedContent.join("\n")).toContain("Kế hoạch của cô Mai");
  });
  it("never invents objectives, curriculum, duration or grade for unstructured content", async () => {
    const a = await analyze("Đây là nội dung chưa có cấu trúc.");
    expect(a).toMatchObject({
      subject: "",
      lessonTitle: "",
      curriculumGrade: "",
      targetAudienceGrade: "",
      durationMinutes: null,
      curriculum: "",
      learningOutcomes: [],
      aiIntegration: [],
      teachingActivities: [],
    });
    expect(a.unmappedContent).toEqual(["Đây là nội dung chưa có cấu trúc."]);
  });
  it("keeps distinct grades and reports mismatch", async () => {
    const a = await analyze("Lớp chương trình: 4\nĐối tượng học sinh: Lớp 5");
    expect(a.curriculumGrade).toBe("4");
    expect(a.targetAudienceGrade).toBe("5");
    expect(analysisWarnings(a).some((x) => x.code === "GRADE_MISMATCH")).toBe(
      true,
    );
  });
  it("keeps first conflicting value and preserves source for review", async () => {
    const a = await analyze("Môn: Toán\nMôn: Tiếng Việt");
    expect(a.subject).toBe("Toán");
    expect(a.sourceWarnings).toHaveLength(1);
    expect(a.unmappedContent).toContain("Môn: Tiếng Việt");
  });
  it.each(["Số tiết: 2", "Số tiết\n2", "Thời lượng: 2 tiết"])(
    "does not assume minutes from periods: %s",
    async (text) => {
      const a = await analyze(text);
      expect(a.durationMinutes).toBeNull();
      expect(a.sourceWarnings.length).toBeGreaterThan(0);
    },
  );
  it("is deterministic and does not modify imported source", async () => {
    const doc = importPastedPlan(fixture),
      before = structuredClone(doc);
    expect(await provider.analyze(doc)).toEqual(await provider.analyze(doc));
    expect(doc).toEqual(before);
  });
  it("tracks exact source text and line for direct metadata", async () => {
    const a = await analyze("Môn: Toán\nLớp: 3");
    expect(a.sourceTraces.find((x) => x.field === "subject")).toMatchObject({
      sourceText: "Môn: Toán",
      lineStart: 1,
      lineEnd: 1,
      confidence: 0.98,
    });
  });
  it("reports actual pipeline stages through provider boundary", async () => {
    const boundary: LessonAnalysisProvider = provider;
    const progress: { index: number; label: string; completed: boolean }[] = [];
    await boundary.analyze(importPastedPlan(fixture), {
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toHaveLength(14);
    expect(progress.filter((p) => p.completed).map((p) => p.label)).toEqual([
      ...analysisSteps,
    ]);
  });
  it("supports cancellation before analysis", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.analyze(importPastedPlan(fixture), undefined, controller.signal),
    ).rejects.toThrow();
  });
  it("supports cancellation between local stages", async () => {
    const controller = new AbortController();
    await expect(
      provider.analyze(
        importPastedPlan(fixture),
        (p) => {
          if (p.index === 1) controller.abort();
        },
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});
describe("Parsing utilities", () => {
  it("normalizes Vietnamese accent and whitespace variants", () =>
    expect(normalizeHeading("  NĂNG   LỰC ĐẶC THÙ ")).toBe("nang luc dac thu"));
  it.each([
    ["35 phút", 35],
    ["1 giờ 15 phút", 75],
    ["1,5 giờ", 90],
    ["45", 45],
    ["2 tiết", null],
    ["30–35 phút", null],
    ["-5 phút", null],
    ["1 giờ -5 phút", null],
    ["không rõ", null],
  ] as const)("parses duration %s as %s", (text, result) =>
    expect(parseDuration(text)).toBe(result),
  );
  it.each([
    ["4", "4"],
    ["Lớp 5", "5"],
    ["Khối 12", "12"],
    ["13", ""],
    ["chưa rõ", ""],
  ] as const)("parses grade %s", (text, result) =>
    expect(parseGrade(text)).toBe(result),
  );
});
describe("Teacher review and future boundaries", () => {
  it("produces nonblocking warnings for missing fields", async () => {
    const a = await analyze("Nội dung chưa phân loại.");
    expect(analysisWarnings(a).map((x) => x.code)).toEqual([
      "SUBJECT",
      "TITLE",
      "DURATION",
      "OUTCOMES",
      "ASSESSMENT",
    ]);
    expect(() => analysisSchema.parse(a)).not.toThrow();
  });
  it("preserves teacher edits and provenance through serialization", async () => {
    const a = await analyze(fixture);
    const edited = editAnalysis(a, "lessonTitle", "Tiêu đề giáo viên chỉnh");
    const restored = deserializeAnalysis(serializeAnalysis(edited));
    expect(restored).toEqual(edited);
    expect(a.lessonTitle).toBe("Thông tin trên Website");
    expect(restored.teacherEditedFields).toEqual(["lessonTitle"]);
    expect(restored.sourceTraces).toEqual(a.sourceTraces);
  });
  it("updates mismatch warnings from current reviewed values", async () => {
    let a = await analyze("Lớp: 4\nLớp học sinh: 5");
    a = editAnalysis(a, "targetAudienceGrade", "4");
    expect(analysisWarnings(a).some((x) => x.code === "GRADE_MISMATCH")).toBe(
      false,
    );
  });
  it("requires explicit teacher confirmation and matching source identity", async () => {
    const doc = importPastedPlan(fixture);
    const draft = {
      document: doc,
      analysis: await provider.analyze(doc),
      confirmedAt: null,
    };
    expect(() => confirmAnalysis(draft, false)).toThrow("kiểm tra");
    expect(confirmAnalysis(draft, true).confirmedAt).toBeTruthy();
    expect(() =>
      confirmAnalysis(
        {
          ...draft,
          analysis: { ...draft.analysis, sourceDocumentId: "other" },
        },
        true,
      ),
    ).toThrow("không khớp");
  });
  it("allows confirmation of structurally valid incomplete analysis without invented values", async () => {
    const document = importPastedPlan("Nội dung chưa phân loại.");
    const draft = confirmAnalysis(
      {
        document,
        analysis: await provider.analyze(document),
        confirmedAt: null,
      },
      true,
    );
    expect(draft.analysis.durationMinutes).toBeNull();
    expect(draft.analysis.subject).toBe("");
  });
  it("renders teacher review with editable fields and disabled confirmation before review", async () => {
    const a = await analyze(fixture);
    const html = renderToStaticMarkup(
      <AnalysisReview
        analysis={a}
        edit={() => {}}
        back={() => {}}
        reanalyze={() => {}}
        confirm={() => {}}
      />,
    );
    expect(html).toContain("Tin học");
    expect(html).toContain("4.B2.1");
    expect(html).toContain("HSKT");
    expect(html).toContain("Lấy thông tin này từ đâu?");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("<script");
  });
  it("offers editor fields for every extracted scalar/list", () => {
    const keys = reviewGroups.flatMap((g) => g.fields.map((f) => f.key));
    expect(keys).toEqual(
      expect.arrayContaining([
        "subject",
        "curriculumGrade",
        "targetAudienceGrade",
        "lessonTitle",
        "topic",
        "durationMinutes",
        "curriculum",
        "learningOutcomes",
        "knowledgeObjectives",
        "competencies",
        "qualities",
        "digitalCompetencyIntegration",
        "aiIntegration",
        "specialNeedsSupport",
        "keyKnowledge",
        "assessmentEvidence",
        "safetyTopics",
        "sourceWarnings",
        "unmappedContent",
      ]),
    );
  });
  it("escapes imported teacher text in review markup", async () => {
    const a = await analyze("Môn: <script>alert(1)</script>");
    const html = renderToStaticMarkup(
      <AnalysisReview
        analysis={a}
        edit={() => {}}
        back={() => {}}
        reanalyze={() => {}}
        confirm={() => {}}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("does not modify or embed raw source in Phase 1 project", async () => {
    const project = createSampleProject();
    const before = exportProjectJSON(project);
    await analyze(fixture);
    expect(exportProjectJSON(project)).toBe(before);
    expect(before).not.toContain("rawText");
    expect(before).toContain('"schemaVersion": "2.2"');
  });
  const blueprint = {
    version: "1.0",
    sourceAnalysisId: "analysis-1",
    title: "Bài học",
    estimatedDurationMinutes: null,
    stages: [
      { stage: "DISCOVERY", purpose: "Khám phá", slideIds: ["slide-1"] },
    ],
    proposedSlides: [
      {
        id: "slide-1",
        type: "content",
        pedagogicalPurpose: "Hình thành kiến thức",
        title: "Nội dung",
        learningGoal: "Hiểu nội dung",
        suggestedContent: ["Ý chính"],
        suggestedInteraction: "",
        mediaIntent: {
          type: "IMAGE",
          purpose: "Minh họa",
          searchQuery: "example",
          required: false,
        },
        estimatedMinutes: 3,
      },
    ],
    warnings: [],
  };
  it("validates future blueprint and media intent without generation", () =>
    expect(blueprintSchema.parse(blueprint)).toEqual(blueprint));
  it("rejects invalid future slide type", () =>
    expect(() =>
      blueprintSchema.parse({
        ...blueprint,
        proposedSlides: [{ ...blueprint.proposedSlides[0], type: "unknown" }],
      }),
    ).toThrow());
  it("rejects dangling blueprint stage references", () =>
    expect(() =>
      blueprintSchema.parse({
        ...blueprint,
        stages: [{ stage: "DISCOVERY", purpose: "", slideIds: ["missing"] }],
      }),
    ).toThrow());
  it("rejects duplicate blueprint slide IDs", () =>
    expect(() =>
      blueprintSchema.parse({
        ...blueprint,
        proposedSlides: [
          blueprint.proposedSlides[0],
          blueprint.proposedSlides[0],
        ],
      }),
    ).toThrow());
  it("rejects malformed analysis serialization", () =>
    expect(() => deserializeAnalysis('{"version":"unknown"}')).toThrow());
});
