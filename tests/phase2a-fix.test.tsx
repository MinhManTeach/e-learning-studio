import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { renderToStaticMarkup } from "react-dom/server";
import { extractDocx } from "../src/import/docx";
import { importPlanFile } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import {
  correctClassification,
  editAnalysis,
  confirmAnalysis,
  analysisWarnings,
} from "../src/import/review";
import { DocumentDiagnostics } from "../src/import/DocumentDiagnostics";
import { AnalysisReview } from "../src/import/AnalysisReview";
const provider = new DeterministicLessonAnalysisProvider();
const ns =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const p = (text: string, props = "") =>
  `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string, props = "") =>
  `<w:tc><w:tcPr>${props}</w:tcPr>${p(text)}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
const table = (...rows: string[]) => `<w:tbl>${rows.join("")}</w:tbl>`;
function docx(body: string, extra: Record<string, string> = {}) {
  return zipSync(
    Object.fromEntries(
      Object.entries({
        "word/document.xml": `<w:document ${ns}><w:body>${body}</w:body></w:document>`,
        ...extra,
      }).map(([k, v]) => [k, strToU8(v)]),
    ),
  );
}
function file(bytes: Uint8Array, name = "lesson.docx") {
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}
const analyze = async (body: string) =>
  provider.analyze(await importPlanFile(file(docx(body))));
const real = (name: string) =>
  readFileSync(new URL(`../src/fixtures/docx/${name}`, import.meta.url));

describe("DOCX structural extraction", () => {
  it("extracts real document preserving five teacher/student tables and paragraph boundaries", async () => {
    const doc = await importPlanFile(file(real("real-lesson-tables.docx")));
    expect(doc.sourceType).toBe("DOCX");
    expect(doc.blocks.filter((b) => b.type === "TABLE")).toHaveLength(5);
    expect(doc.blocks.map((b) => b.sourceOrder)).toEqual(
      doc.blocks.map((_, i) => i),
    );
    const t = doc.blocks.find((b) => b.table)!.table!;
    expect(t.rows[0].cells.map((c) => c.text)).toEqual([
      "Hoạt động của GV",
      "Hoạt động của HS",
    ]);
    expect(t.rows[1].cells[0].text).toContain("Chiếu video");
    expect(t.rows[1].cells[1].text).toContain("Thảo luận");
    expect(doc.rawText).toContain("I. YÊU CẦU CẦN ĐẠT");
  });
  it("preserves Word heading style, inherited outline level and list numbering", () => {
    const bytes = docx(
      p("MỤC TIÊU", '<w:pStyle w:val="CustomHeading"/>') +
        p(
          "Nêu được ví dụ",
          '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr>',
        ),
      {
        "word/styles.xml": `<w:styles ${ns}><w:style w:styleId="Base"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:styleId="CustomHeading"><w:basedOn w:val="Base"/></w:style></w:styles>`,
        "word/numbering.xml": `<w:numbering ${ns}><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
      },
    );
    const result = extractDocx(bytes);
    expect(result.blocks[0]).toMatchObject({
      type: "HEADING",
      level: 1,
      text: "MỤC TIÊU",
    });
    expect(result.blocks[1]).toMatchObject({
      type: "LIST",
      text: "I. Nêu được ví dụ",
      numbering: "I.",
    });
  });
  it("retains horizontal and vertical merged cell coordinates and spans", () => {
    const bytes = docx(
      table(
        row(
          cell("A", '<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>'),
          cell("B"),
        ),
        row(cell("", '<w:gridSpan w:val="2"/><w:vMerge/>'), cell("C")),
      ),
    );
    const t = extractDocx(bytes).blocks[0].table!;
    expect(t.rows[0].cells[0]).toMatchObject({
      text: "A",
      colspan: 2,
      rowspan: 2,
      column: 0,
    });
    expect(t.rows[1].cells).toHaveLength(1);
    expect(t.rows[1].cells[0]).toMatchObject({ text: "C", column: 2 });
  });
  it("reports orphan merge rather than dropping its text", () => {
    const result = extractDocx(
      docx(table(row(cell("Giữ lại", "<w:vMerge/>")))),
    );
    expect(result.rawText).toContain("Giữ lại");
    expect(result.warnings.join()).toContain("thiếu ô bắt đầu");
  });
  it("rejects renamed/non-DOCX archive", () =>
    expect(() => extractDocx(zipSync({ "x.txt": strToU8("x") }))).toThrow(
      "thiếu",
    ));
  it("rejects invalid XML", () =>
    expect(() =>
      extractDocx(zipSync({ "word/document.xml": strToU8("<bad>") })),
    ).toThrow("XML"));
  it("rejects entity/DTD XML", () =>
    expect(() =>
      extractDocx(
        zipSync({
          "word/document.xml": strToU8('<!DOCTYPE x [<!ENTITY y "z">]><x/>'),
        }),
      ),
    ).toThrow("XML"));
  it("rejects expansion beyond bounded XML limit", () =>
    expect(() => extractDocx(docx(p("x".repeat(21 * 1024 * 1024))))).toThrow(
      "quá lớn",
    ));
});
describe("Contextual pedagogical classification", () => {
  it("respects outcome hierarchy and preparation/activity section boundaries", async () => {
    const a = await analyze(
      p("I. YÊU CẦU CẦN ĐẠT") +
        p("- Nhận biết thông tin.") +
        p("1. Kiến thức") +
        p("- Phân biệt hình và chữ.") +
        p("2. Năng lực chung") +
        p("- Hợp tác.") +
        p("Năng lực đặc thù") +
        p("- Thao tác máy tính.") +
        p("3. Phẩm chất") +
        p("- Trung thực.") +
        p("II. ĐỒ DÙNG DẠY HỌC") +
        p("Máy chiếu.") +
        p("III. CÁC HOẠT ĐỘNG DẠY HỌC") +
        p("A. Khởi động") +
        p("Học sinh thực hiện trò chơi."),
    );
    expect(a.learningOutcomes).toEqual(["Nhận biết thông tin."]);
    expect(a.knowledgeObjectives).toEqual(["Phân biệt hình và chữ."]);
    expect(a.competencies).toEqual(["Hợp tác.", "Thao tác máy tính."]);
    expect(a.qualities).toEqual(["Trung thực."]);
    expect(a.unmappedContent).toContain("Máy chiếu.");
    expect(a.teachingActivities[0].content).toEqual([
      "Học sinh thực hiện trò chơi.",
    ]);
  });
  it.each(["MỤC TIÊU", "I. Mục tiêu bài học:", "YÊU CẦU CẦN ĐẠT"])(
    "recognizes heading variant %s",
    async (h) => {
      const a = await analyze(p(h) + p("Nêu được ví dụ."));
      expect(a.learningOutcomes).toEqual(["Nêu được ví dụ."]);
    },
  );
  it("keeps teacher/student columns out of learning outcomes", async () => {
    const a = await analyze(
      p("I. Mục tiêu") +
        p("Nhận biết được hình ảnh.") +
        p("II. Hoạt động dạy học") +
        p("Khởi động") +
        table(
          row(cell("Hoạt động của giáo viên"), cell("Hoạt động của học sinh")),
          row(
            cell("GV yêu cầu học sinh thực hiện."),
            cell("Học sinh thực hiện nhiệm vụ."),
          ),
        ),
    );
    expect(a.learningOutcomes).toEqual(["Nhận biết được hình ảnh."]);
    expect(a.teachingActivities[0].teacherActivity).toEqual([
      "GV yêu cầu học sinh thực hiện.",
    ]);
    expect(a.teachingActivities[0].studentActivity).toEqual([
      "Học sinh thực hiện nhiệm vụ.",
    ]);
    const c = a.classifications.find(
      (c) => c.sourceText === "Học sinh thực hiện nhiệm vụ.",
    )!;
    expect(c.category).toBe("STUDENT_ACTIVITY");
    expect(c.signals.join()).toContain("nhãn cột");
  });
  it("maps activity goals/content/products/organization without mixing lesson outcomes", async () => {
    const a = await analyze(
      p("Hoạt động dạy học") +
        table(
          row(
            ...[
              "Hoạt động",
              "Mục tiêu",
              "Nội dung",
              "Sản phẩm",
              "Tổ chức thực hiện",
            ].map((s) => cell(s)),
          ),
          row(
            ...[
              "Khám phá",
              "Phân loại được",
              "Các dạng thông tin",
              "Bảng phân loại",
              "Làm việc nhóm",
            ].map((s) => cell(s)),
          ),
        ),
    );
    expect(a.teachingActivities[0]).toMatchObject({
      title: "Khám phá",
      goals: ["Phân loại được"],
      content: ["Các dạng thông tin"],
      products: ["Bảng phân loại"],
      organization: ["Làm việc nhóm"],
    });
    expect(a.learningOutcomes).toEqual([]);
  });
  it("maps vertical activity property rows", async () => {
    const a = await analyze(
      p("Hoạt động dạy học") +
        p("Khám phá") +
        table(
          row(cell("Mục tiêu"), cell("Nhận biết chữ")),
          row(cell("Nội dung"), cell("Quan sát website")),
          row(cell("Sản phẩm"), cell("Phiếu trả lời")),
        ),
    );
    expect(a.teachingActivities[0].goals).toEqual(["Nhận biết chữ"]);
    expect(a.teachingActivities[0].products).toEqual(["Phiếu trả lời"]);
    expect(a.learningOutcomes).toEqual([]);
  });
  it("handles identity in key/value table", async () => {
    const a = await analyze(
      table(
        row(cell("Môn"), cell("Toán")),
        row(cell("Lớp"), cell("2")),
        row(cell("Thời lượng"), cell("35 phút")),
      ),
    );
    expect(a).toMatchObject({
      subject: "Toán",
      curriculumGrade: "2",
      durationMinutes: 35,
    });
  });
  it("keeps conflicting merged data for teacher classification", async () => {
    const a = await analyze(
      p("Khởi động") +
        table(
          row(cell("Hoạt động của GV"), cell("Hoạt động của HS")),
          row(cell("Ô này dành cho cả hai", '<w:gridSpan w:val="2"/>')),
        ),
    );
    expect(a.teachingActivities[0].teacherActivity).toEqual([]);
    expect(a.teachingActivities[0].studentActivity).toEqual([]);
    expect(a.unmappedContent).toContain("Ô này dành cho cả hai");
    expect(
      a.classifications.find((c) => c.sourceText === "Ô này dành cho cả hai")
        ?.needsReview,
    ).toBe(true);
  });
  it("does not assign isolated keywords without structural context", async () => {
    const a = await analyze(p("Học sinh thực hiện và AI hỗ trợ hoạt động."));
    expect(a.learningOutcomes).toEqual([]);
    expect(a.aiIntegration).toEqual([]);
    expect(a.unmappedContent).toHaveLength(1);
  });
  it("unknown top-level headings end previous section", async () => {
    const a = await analyze(
      p("I. Mục tiêu") +
        p("Nêu được ví dụ.") +
        p("II. Một mục chưa biết") +
        p("Không gán vào mục tiêu."),
    );
    expect(a.learningOutcomes).toEqual(["Nêu được ví dụ."]);
    expect(a.unmappedContent).toContain("Không gán vào mục tiêu.");
  });
  it("keeps unknown activity subheadings within the activity context", async () => {
    const a = await analyze(
      p("III. Hoạt động dạy học") +
        p("1. Khám phá") +
        p("a. Quan sát tranh:") +
        p("Học sinh phân loại hình ảnh."),
    );
    expect(a.teachingActivities[0].content.join()).toContain(
      "Học sinh phân loại hình ảnh.",
    );
    expect(a.learningOutcomes).toEqual([]);
  });
  it("extracts assessment, HSKT, digital and AI sections independently", async () => {
    const a = await analyze(
      p("Đánh giá") +
        p("Phiếu trả lời.") +
        p("HSKT") +
        p("Dùng hình lớn.") +
        p("Năng lực số") +
        p("Thao tác an toàn.") +
        p("[TÍCH HỢP AI]") +
        p("4.B2.1 Bảo vệ dữ liệu."),
    );
    expect(a.assessmentEvidence).toEqual(["Phiếu trả lời."]);
    expect(a.specialNeedsSupport).toEqual(["Dùng hình lớn."]);
    expect(a.digitalCompetencyIntegration).toEqual(["Thao tác an toàn."]);
    expect(a.aiIntegration).toEqual(["4.B2.1 Bảo vệ dữ liệu."]);
  });
  it("real table lesson retains all instructional groups and no invented duration", async () => {
    const doc = await importPlanFile(file(real("real-lesson-tables.docx")));
    const a = await provider.analyze(doc);
    expect(a).toMatchObject({
      subject: "TIN HỌC",
      curriculumGrade: "5",
      lessonTitle: "CẤU TRÚC TUẦN TỰ",
      durationMinutes: null,
    });
    expect(a.knowledgeObjectives).toHaveLength(2);
    expect(a.competencies).toHaveLength(3);
    expect(a.qualities).toHaveLength(1);
    expect(a.aiIntegration).toHaveLength(1);
    expect(
      a.teachingActivities.filter((x) => x.teacherActivity.length),
    ).toHaveLength(5);
    expect(a.learningOutcomes.join()).not.toContain("Chiếu video");
    expect(a.unmappedContent.join()).toContain("GV: SGK");
    expect(analysisWarnings(a).some((w) => w.code === "OUTCOMES")).toBe(false);
  });
  it("second real lesson title identifies Tin học lớp 3 rather than tuần 2", async () => {
    const a = await provider.analyze(
      await importPlanFile(file(real("real-lesson-ai.docx"))),
    );
    expect(a.subject).toBe("TIN HỌC");
    expect(a.curriculumGrade).toBe("3");
    expect(a.knowledgeObjectives).toHaveLength(3);
    expect(a.competencies).toHaveLength(2);
    expect(a.qualities).toHaveLength(1);
    expect(
      a.teachingActivities
        .find((x) => x.title.startsWith("Khám phá"))
        ?.content.join(),
    ).toContain("Phân loại thông tin");
  });
});
describe("Teacher correction and diagnostics", () => {
  it("nested table text is retained for review rather than assigned to a single outer column", async () => {
    const a = await analyze(
      p("Khởi động") +
        table(
          row(cell("Hoạt động của GV"), cell("Hoạt động của HS")),
          row(
            `<w:tc>${p("Bảng con")}${table(row(cell("GV con"), cell("HS con")))}</w:tc>`,
            cell("Trả lời"),
          ),
        ),
    );
    expect(a.teachingActivities[0].teacherActivity).toEqual([]);
    expect(a.unmappedContent.join()).toContain("HS con");
    expect(a.sourceWarnings.join()).toContain("Bảng lồng");
  });
  it("supports subject-specific competencies outside Tin học", async () => {
    const a = await analyze(
      p("I. Mục tiêu") +
        p("2. Năng lực toán học") +
        p("Giải quyết vấn đề toán học.") +
        p("Năng lực số") +
        p("Sử dụng thiết bị an toàn."),
    );
    expect(a.competencies).toEqual(["Giải quyết vấn đề toán học."]);
    expect(a.digitalCompetencyIntegration).toEqual([
      "Sử dụng thiết bị an toàn.",
    ]);
  });
  it("unlabelled multicolumn table cannot leak into an outcome section", async () => {
    const a = await analyze(
      p("I. Yêu cầu cần đạt") +
        p("Nêu được ví dụ.") +
        table(
          row(cell("Cột chưa biết A"), cell("Cột chưa biết B")),
          row(cell("Học sinh thực hiện nhiệm vụ"), cell("Giáo viên quan sát")),
        ),
    );
    expect(a.learningOutcomes).toEqual(["Nêu được ví dụ."]);
    expect(a.unmappedContent).toContain("Học sinh thực hiện nhiệm vụ");
  });
  it("merged teacher/student headers fall back without dropping cell text", async () => {
    const a = await analyze(
      p("Khởi động") +
        table(
          row(
            cell("Hoạt động của GV", '<w:vMerge w:val="restart"/>'),
            cell("Hoạt động của HS"),
          ),
          row(cell("", "<w:vMerge/>"), cell("Học sinh thực hiện.")),
        ),
    );
    expect(a.unmappedContent).toContain("Học sinh thực hiện.");
    expect(a.teachingActivities[0].studentActivity).toEqual([]);
    expect(a.sourceWarnings.join()).toContain("gộp");
  });
  it("DOCX source trace records original block and cell coordinates", async () => {
    const a = await analyze(
      p("Khởi động") +
        table(
          row(cell("Hoạt động của GV"), cell("Hoạt động của HS")),
          row(cell("Giáo viên hướng dẫn"), cell("Học sinh trả lời")),
        ),
    );
    expect(
      a.sourceTraces.find((t) => t.sourceText === "Học sinh trả lời"),
    ).toMatchObject({ blockId: "block-2", row: 1, column: 1, lineStart: 3 });
  });
  it("moves uncertain content into selected field and retains source and confidence explanation", async () => {
    const a = await analyze(p("Một đoạn chưa rõ."));
    const c = a.classifications.find((c) => c.needsReview)!;
    const updated = correctClassification(a, c.id, "LEARNING_OUTCOME");
    expect(updated.learningOutcomes).toEqual(["Một đoạn chưa rõ."]);
    expect(updated.unmappedContent).toEqual([]);
    expect(a.unmappedContent).toHaveLength(1);
    expect(updated.classifications[0]).toMatchObject({
      corrected: true,
      needsReview: false,
      category: "LEARNING_OUTCOME",
      field: "learningOutcomes[0]",
      confidence: c.confidence,
    });
    expect(updated.teacherEditedFields).toContain("learningOutcomes");
    expect(updated.sourceTraces.at(-1)?.sourceText).toBe(c.sourceText);
  });
  it.each([
    "KNOWLEDGE",
    "COMPETENCY",
    "QUALITY",
    "ASSESSMENT",
    "DIGITAL_COMPETENCY",
    "AI_INTEGRATION",
    "SPECIAL_NEEDS",
    "OTHER",
    "TEACHING_ACTIVITY",
  ] as const)("supports correction to %s", async (category) => {
    const a = await analyze(p("Nội dung chưa rõ."));
    expect(
      correctClassification(a, a.classifications[0].id, category)
        .classifications[0].category,
    ).toBe(category);
  });
  it("keeps remaining uncertain item indexes valid after consecutive corrections", async () => {
    const a = await analyze(p("Đoạn A.") + p("Đoạn B."));
    const b = correctClassification(a, a.classifications[0].id, "KNOWLEDGE");
    const c = correctClassification(b, a.classifications[1].id, "QUALITY");
    expect(c.knowledgeObjectives).toEqual(["Đoạn A."]);
    expect(c.qualities).toEqual(["Đoạn B."]);
    expect(c.unmappedContent).toEqual([]);
  });
  it("invalidates stale mapping after direct teacher edit/delete", async () => {
    const a = await analyze(p("Đoạn A.") + p("Đoạn B."));
    const b = editAnalysis(a, "unmappedContent", ["Đoạn B."]);
    expect(b.classifications[0].needsReview).toBe(false);
    expect(b.classifications[1].field).toBe("unmappedContent[0]");
    expect(() =>
      correctClassification(b, b.classifications[0].id, "QUALITY"),
    ).toThrow();
  });
  it("still requires review confirmation", async () => {
    const document = await importPlanFile(file(docx(p("Một đoạn."))));
    const analysis = await provider.analyze(document);
    expect(() =>
      confirmAnalysis({ document, analysis, confirmedAt: null }, false),
    ).toThrow("kiểm tra");
  });
  it("renders development structure/debug view and Vietnamese correction without raw JSON editing", async () => {
    const document = await importPlanFile(
      file(docx(p("&lt;script&gt;không chạy&lt;/script&gt;"))),
    );
    const analysis = await provider.analyze(document);
    const html = renderToStaticMarkup(
      <DocumentDiagnostics
        document={document}
        analysis={analysis}
        correct={() => {}}
      />,
    );
    expect(html).toContain("Kiểm tra phân tích tài liệu");
    expect(html).toContain("Đây là nội dung gì?");
    expect(html).toContain("Chuyển vào nhóm đã chọn");
    expect(html).not.toContain("<script>");
  });
  it("renders editable teacher/student activity fields and list add/delete controls", async () => {
    const analysis = await analyze(p("Khởi động") + p("Quan sát tranh."));
    const html = renderToStaticMarkup(
      <AnalysisReview
        analysis={analysis}
        edit={() => {}}
        back={() => {}}
        reanalyze={() => {}}
        confirm={() => {}}
      />,
    );
    expect(html).toContain("Hoạt động của giáo viên");
    expect(html).toContain("Hoạt động của học sinh");
    expect(html).toContain("Thêm ý");
  });
});
