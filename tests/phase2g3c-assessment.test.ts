import { it, expect } from "vitest";
import { importPastedPlan } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import {
  studentAssessment,
  updateAssessment,
  scoredAssessments,
} from "../src/import/assessments";
const analyze = async (text: string) =>
  new DeterministicLessonAnalysisProvider().analyze(importPastedPlan(text));
it("extracts multiple choices with a separate explicit answer and stable IDs", async () => {
  const text =
    "Câu 1: Em chọn thao tác nào?\nA. Nháy chuột\nB. Rút điện\nĐáp án câu 1: A";
  const a = await analyze(text);
  const b = await analyze(text);
  expect(a.assessments).toHaveLength(1);
  expect(a.assessments![0].type).toBe("MULTIPLE_CHOICE");
  expect(a.assessments![0].choices).toHaveLength(2);
  expect(a.assessments![0].answer?.text).toBe("Đáp án câu 1: A");
  expect(a.assessments![0].answer?.status).toBe("SOURCE_VERIFIED");
  expect(a.assessments![0].id).toBe(b.assessments![0].id);
});
it.each([
  ["Đúng hay sai: Em nên giữ tay khô.", "TRUE_FALSE"],
  ["Nối các bộ phận với chức năng tương ứng.", "MATCHING"],
  ["Sắp xếp các bước bật máy theo thứ tự.", "ORDERING"],
  ["Vì sao cần nghỉ ngơi?", "SHORT_ANSWER"],
  ["Tiêu chí đánh giá: HS thực hiện được thao tác nháy chuột.", "PERFORMANCE"],
])("classifies %s", async (text, type) => {
  const a = await analyze(text);
  expect(a.assessments?.[0].type).toBe(type);
});
it("retains matching pairs and explicit matching keys", async () => {
  const a = await analyze(
    "Nối các bộ phận với chức năng tương ứng.\n1. Chuột\n2. Màn hình\na. Hiển thị\nb. Điều khiển\nĐáp án: 1–b, 2–a",
  );
  expect(a.assessments![0].choices).toHaveLength(4);
  expect(a.assessments![0].answer?.status).toBe("SOURCE_VERIFIED");
});
it("leaves missing answers unresolved", async () => {
  const a = await analyze("Vì sao em cần ngồi thẳng?");
  expect(a.assessments![0].reviewStatus).toBe("NEEDS_TEACHER_REVIEW");
  expect(a.assessments![0].answer).toBeNull();
});
it("flags conflicting keys without selecting a winner", async () => {
  const a = await analyze(
    "Câu 1: Em chọn gì?\nA. Chuột\nB. Bàn phím\nĐáp án câu 1: A\nĐáp án câu 1: B",
  );
  expect(a.assessments![0].answer?.status).toBe("NEEDS_TEACHER_REVIEW");
  expect(a.assessments![0].answerCandidates).toHaveLength(2);
});
it("ignores game titles examples and teacher logistical questions", async () => {
  const a = await analyze(
    "Trò chơi: Ai nhanh - Ai đúng?\nVí dụ: Em chọn gì?\nGV kiểm tra: Các em đã sẵn sàng chưa?",
  );
  expect(a.assessments).toEqual([]);
});
it("marks worksheet questions and keeps provenance", async () => {
  const a = await analyze("PHIẾU HỌC TẬP\nCâu 1: Vì sao cần giữ khoảng cách?");
  expect(a.assessments![0].context).toBe("WORKSHEET");
  expect(a.assessments![0].sources[0].sourceText).toContain("Vì sao");
  expect(a.assessments![0].sources[0].blockId).toBeTruthy();
});
it("deduplicates same prompt preserving all sources", async () => {
  const a = await analyze("Vì sao cần nghỉ ngơi?\nVì sao cần nghỉ ngơi?");
  expect(a.assessments).toHaveLength(1);
  expect(a.assessments![0].duplicateCount).toBe(1);
  expect(a.assessments![0].sources).toHaveLength(2);
});
it("keeps teacher corrections through analysis serialization and gates scoring", async () => {
  const a = await analyze("Em nên làm gì?");
  let q = updateAssessment(a.assessments![0], {
    choices: [{ label: "A", text: "Nghỉ ngơi" }],
    type: "MULTIPLE_CHOICE",
    answerText: "A",
  });
  expect(q.reviewStatus).toBe("NEEDS_TEACHER_REVIEW");
  q = updateAssessment(q, { reviewStatus: "READY" });
  expect(scoredAssessments({ ...a, assessments: [q] })).toHaveLength(1);
  expect(updateAssessment(q, { prompt: "Em chọn gì?" }).reviewStatus).toBe(
    "NEEDS_TEACHER_REVIEW",
  );
  expect(
    scoredAssessments({
      ...a,
      assessments: [updateAssessment(q, { reviewStatus: "EXCLUDED" })],
    }),
  ).toEqual([]);
});
it("conceals teacher keys feedback and original source before submission", async () => {
  const a = await analyze(
    "Em nên làm gì?\nĐáp án: Nghỉ ngơi\nGiải thích: Bảo vệ mắt",
  );
  const q = updateAssessment(a.assessments![0], { reviewStatus: "READY" });
  expect(JSON.stringify(studentAssessment(q, false))).not.toMatch(
    /Đáp án|Nghỉ ngơi|Bảo vệ mắt|sourceText|answer/,
  );
  expect(studentAssessment(q, true)).toHaveProperty("answer");
});
it("does not confirm a question without a usable answer", async () => {
  const a = await analyze("Em nên làm gì?");
  expect(
    updateAssessment(a.assessments![0], { reviewStatus: "READY" }).reviewStatus,
  ).toBe("NEEDS_TEACHER_REVIEW");
});
it("associates each unnumbered key only with the preceding question", async () => {
  const a = await analyze(
    "Em chọn thao tác nào?\nĐáp án: Nghỉ\nEm dùng bộ phận nào?\nĐáp án: Chuột",
  );
  expect(a.assessments?.map((q) => q.answer?.value)).toEqual(["Nghỉ", "Chuột"]);
});
it("does not associate answer keys across worksheet boundaries", async () => {
  const a = await analyze(
    "PHIẾU HỌC TẬP 1\nCâu 1: Em chọn gì?\nPHIẾU HỌC TẬP 2\nĐáp án câu 1: Chuột",
  );
  expect(a.assessments![0].answer).toBeNull();
});
it("separates inline teacher answer keys from student prompts", async () => {
  const a = await analyze("Câu 1: Em chọn gì? Đáp án: Chuột");
  expect(a.assessments![0].answer?.value).toBe("Chuột");
  expect(studentAssessment(a.assessments![0]).prompt).not.toContain("Chuột");
});
it("round trips teacher edits and original answer evidence", async () => {
  const { serializeAnalysis, deserializeAnalysis } =
    await import("../src/import/model");
  const a = await analyze("Em nên làm gì?\nĐáp án: Nghỉ ngơi");
  const original = a.assessments![0];
  a.assessments = [updateAssessment(original, { answerText: "Nghỉ hợp lí" })];
  const b = deserializeAnalysis(serializeAnalysis(a));
  expect(b.assessments![0].answer?.value).toBe("Nghỉ hợp lí");
  expect(b.assessments![0].answerCandidates[0].text).toBe("Đáp án: Nghỉ ngơi");
});
it("extracts neighboring-cell questions keys duplicate candidates and rubric table coordinates", async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const { importPlanFile } = await import("../src/import/documents");
  const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const cell = (...ts: string[]) => `<w:tc>${ts.map(p).join("")}</w:tc>`;
  const row = (...cs: string[]) => `<w:tr>${cs.join("")}</w:tr>`;
  const body =
    p("TIẾT 1") +
    p("Khởi động (5 phút)") +
    "<w:tbl>" +
    row(cell("GV"), cell("HS")) +
    row(
      cell("Câu 1: Em dùng gì?", "A. Chuột", "B. Màn hình"),
      cell("Câu 1: Em dùng gì?", "Đáp án câu 1: A"),
    ) +
    "</w:tbl>" +
    p("BẢNG ĐÁNH GIÁ") +
    "<w:tbl>" +
    row(cell("Tiêu chí"), cell("Mức độ")) +
    row(cell("HS thực hiện được nháy chuột."), cell("Đạt")) +
    "</w:tbl>";
  const bytes = zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
  const d = await importPlanFile({
    name: "synthetic.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const a = await new DeterministicLessonAnalysisProvider().analyze(d);
  const q = a.assessments![0];
  expect(q.duplicateCount).toBe(1);
  expect(q.answer?.status).toBe("SOURCE_VERIFIED");
  expect(q.sources[0]).toMatchObject({ tableIndex: 0, row: 1, column: 0 });
  expect(q.activityId).toBe(a.teachingActivities[0].id);
  expect(q.periodId).toBe(a.teachingPeriods![0].id);
  expect(
    a.assessments?.some(
      (q) => q.context === "RUBRIC" && q.type === "PERFORMANCE",
    ),
  ).toBe(true);
});
it("does not turn competency statements or quoted game mentions into quiz prompts", async () => {
  const a = await analyze(
    "Giao tiếp và hợp tác: Nhận xét tư thế đúng/sai.\nTham gia hoạt động “AI làm chủ?”, cùng nhóm.\nCâu trả lời về tư thế đúng/sai.",
  );
  expect(a.assessments).toEqual([]);
});
it("splits multiple questions and choices within a multiline cell and hides teacher conclusions", async () => {
  const d = importPastedPlan("placeholder");
  d.blocks = [
    {
      id: "table-1",
      type: "TABLE",
      sourceOrder: 0,
      table: {
        rows: [
          {
            cells: [
              {
                text: "Câu 1: Em chọn gì?\nA. Chuột\nB. Màn hình\nCâu 2: Em làm gì? GV chốt: Tự thực hành.",
                paragraphs: [
                  "Câu 1: Em chọn gì?\nA. Chuột\nB. Màn hình\nCâu 2: Em làm gì? GV chốt: Tự thực hành.",
                ],
              },
            ],
          },
        ],
      },
    },
  ];
  d.sourceType = "DOCX";
  const a = await new DeterministicLessonAnalysisProvider().analyze(d);
  expect(a.assessments).toHaveLength(2);
  expect(a.assessments![0].choices).toHaveLength(2);
  expect(studentAssessment(a.assessments![1]).prompt).not.toContain(
    "Tự thực hành",
  );
  expect(a.assessments![1].sources[0].originalSourceText).toContain("GV chốt");
});
it("recovers worksheet table rows rather than isolated column headings", async () => {
  const d = importPastedPlan("placeholder");
  d.sourceType = "DOCX";
  d.blocks = [
    {
      id: "table-1",
      type: "TABLE",
      sourceOrder: 0,
      table: {
        rows: [
          {
            cells: [
              { text: "Tình huống" },
              { text: "Đúng hay sai?" },
              { text: "Vì sao?" },
            ],
          },
          {
            cells: [
              { text: "Ngồi quá gần màn hình" },
              { text: "" },
              { text: "" },
            ],
          },
          { cells: [{ text: "Ngồi thẳng lưng" }, { text: "" }, { text: "" }] },
        ],
      },
    },
  ];
  const a = await new DeterministicLessonAnalysisProvider().analyze(d);
  expect(a.assessments).toHaveLength(2);
  expect(a.assessments![0]).toMatchObject({
    context: "WORKSHEET",
    type: "TRUE_FALSE",
  });
  expect(a.assessments![0].prompt).toContain("Ngồi quá gần");
  expect(a.assessments![0].answer).toBeNull();
});
it("removes teacher keys excluded and unresolved source questions only from generation input", async () => {
  const { generationSafeAnalysis } = await import("../src/import/assessments");
  const a = await analyze(
    "Khởi động (5 phút)\nEm chọn gì?\nA. Chuột\nB. Rút điện\nĐáp án: A",
  );
  const original = JSON.stringify(a);
  const safe = generationSafeAnalysis(a);
  expect(
    safe.teachingActivities.flatMap((t) => t.content).join(" "),
  ).not.toMatch(/Đáp án|Em chọn gì/);
  expect(JSON.stringify(a)).toBe(original);
  expect(a.assessments![0].answer?.text).toBe("Đáp án: A");
});
it("supports numbered standalone answer-key sections", async () => {
  const a = await analyze(
    "Câu 1: Em chọn gì?\nA. Chuột\nB. Màn hình\nĐÁP ÁN\n1. B",
  );
  expect(a.assessments![0].answer?.status).toBe("SOURCE_VERIFIED");
  expect(a.assessments![0].answer?.text).toBe("1. B");
});
it("confirms observation criteria without manufacturing a quiz answer", async () => {
  const a = await analyze("Tiêu chí đánh giá: Quan sát tư thế ngồi.");
  const q = updateAssessment(a.assessments![0], { reviewStatus: "READY" });
  expect(q.reviewStatus).toBe("READY");
  expect(q.answer).toBeNull();
  expect(scoredAssessments({ ...a, assessments: [q] })).toEqual([]);
});
it("retains marked option evidence while concealing the correct annotation", async () => {
  const a = await analyze(
    "Câu 1: Em chọn gì?\nA. Chuột (đáp án đúng)\nB. Màn hình",
  );
  expect(a.assessments![0].answer?.value).toBe("A");
  expect(JSON.stringify(studentAssessment(a.assessments![0]))).not.toContain(
    "đáp án đúng",
  );
  expect(
    a.assessments![0].sources.some((s) => s.sourceText.includes("đáp án đúng")),
  ).toBe(true);
});
it("blocks numbered source questions and cleaned choices consistently at the generation boundary", async () => {
  const { generationSafeAnalysis } = await import("../src/import/assessments");
  const a = await analyze(
    "Khởi động (5 phút)\nCâu 1: Em chọn gì?\nA. Chuột\nB. Màn hình\nĐáp án câu 1: A",
  );
  a.teachingActivities[0].content = [
    "1. Em chọn gì?",
    "A. Chuột",
    "B. Màn hình",
    "Đáp án câu 1: A",
  ];
  expect(generationSafeAnalysis(a).teachingActivities[0].content).toEqual([]);
});
