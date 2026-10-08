import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { importPlanFile } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { gradeEvidence } from "../src/import/grades";
import { serializeAnalysis, deserializeAnalysis } from "../src/import/model";
async function analyze(lines: string[]) {
  const xml =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    lines.map((t) => "<w:p><w:r><w:t>" + t + "</w:t></w:r></w:p>").join("") +
    "</w:body></w:document>";
  const bytes = zipSync({ "word/document.xml": strToU8(xml) });
  const document = await importPlanFile({
    name: "sanitized.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  return {
    document,
    a: await new DeterministicLessonAnalysisProvider().analyze(document),
  };
}
it("recovers TIN HỌC 3 with explicit curriculum grade provenance", async () => {
  const { a, document } = await analyze(["TIN HỌC 3"]);
  expect(a.subject.toLocaleLowerCase("vi")).toBe("tin học");
  expect(a.curriculumGrade).toBe("3");
  expect(a.targetAudienceGrade).toBe("");
  expect(gradeEvidence(a, "curriculumGrade")).toMatchObject({
    source: "DOCUMENT",
    confirmed: false,
  });
  expect(a.sourceTraces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "curriculumGrade",
        blockId: document.blocks[0].id,
        sourceText: "TIN HỌC 3",
      }),
    ]),
  );
});
it("recovers a numbered lesson heading without a colon", async () => {
  const { a } = await analyze(["BÀI 4. LÀM VIỆC VỚI MÁY TÍNH"]);
  expect(a.lessonNumber).toBe(4);
  expect(a.lessonTitle.toLocaleLowerCase("vi")).toBe(
    "bài 4 — làm việc với máy tính",
  );
  expect(a.sourceTraces).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "lessonNumber" }),
      expect.objectContaining({ field: "lessonTitle" }),
    ]),
  );
});
it("accepts common metadata labels without colons", async () => {
  const { a } = await analyze([
    "Môn học Tin học",
    "Lớp 3",
    "Tên bài học Quan sát mẫu",
  ]);
  expect(a).toMatchObject({
    subject: "Tin học",
    curriculumGrade: "3",
    lessonTitle: "Quan sát mẫu",
  });
});
it("derives 105 minutes from three explicitly 35-minute periods", async () => {
  const { a } = await analyze([
    "Số tiết: 3 tiết",
    "Phân bổ thời lượng: 3 tiết, mỗi tiết 35 phút.",
  ]);
  expect(a).toMatchObject({
    periodCount: 3,
    minutesPerPeriod: 35,
    totalDurationMinutes: 105,
    durationMinutes: 105,
  });
  for (const field of [
    "periodCount",
    "minutesPerPeriod",
    "totalDurationMinutes",
  ])
    expect(a.sourceTraces.some((t) => t.field === field && t.blockId)).toBe(
      true,
    );
  expect(a.teachingActivities).toHaveLength(0);
});
it("leaves total unresolved when period length is absent, even with timed activities", async () => {
  const { a } = await analyze([
    "Số tiết 3 tiết",
    "III. CÁC HOẠT ĐỘNG DẠY HỌC",
    "Khởi động (5 phút)",
  ]);
  expect(a.periodCount).toBe(3);
  expect(a.minutesPerPeriod).toBeNull();
  expect(a.totalDurationMinutes).toBeNull();
  expect(a.durationMinutes).toBeNull();
});
it("flags conflicting activity allocations without changing the explicit total", async () => {
  const { a } = await analyze([
    "Thời lượng: 1 tiết, mỗi tiết 35 phút",
    "III. CÁC HOẠT ĐỘNG DẠY HỌC",
    "Khởi động (5 phút)",
    "Thực hành (10 phút)",
  ]);
  expect(a.totalDurationMinutes).toBe(35);
  expect(a.teachingActivities.map((t) => t.activityDurationMinutes)).toEqual([
    5, 10,
  ]);
  expect(a.sourceWarnings.some((w) => /15.*35|35.*15/.test(w))).toBe(true);
});
it("classifies AI competencies before general competencies", async () => {
  const { a } = await analyze([
    "I. YÊU CẦU CẦN ĐẠT",
    "1. Năng lực",
    "a) Năng lực AI:",
    "- Nhận biết trợ lý AI.",
  ]);
  expect(a.aiIntegration).toEqual(["Nhận biết trợ lý AI."]);
  expect(a.competencies).toEqual([]);
});
it("keeps digital competencies separate", async () => {
  const { a } = await analyze(["Năng lực số:", "- Sử dụng thiết bị an toàn."]);
  expect(a.digitalCompetencyIntegration).toEqual(["Sử dụng thiết bị an toàn."]);
  expect(a.competencies).toEqual([]);
});
it("distinguishes subject and general competencies with source references", async () => {
  const { a } = await analyze([
    "I. YÊU CẦU CẦN ĐẠT",
    "a) Năng lực Tin học:",
    "- Thao tác với thiết bị.",
    "b) Năng lực chung:",
    "- Hợp tác trong nhóm.",
  ]);
  const statements = a.classifications.filter(
    (c) => !c.isHeading && c.category === "COMPETENCY",
  );
  expect(statements.map((c) => c.competencyKind)).toEqual([
    "SUBJECT_SPECIFIC",
    "GENERAL",
  ]);
  expect(
    statements.every(
      (c) => c.isRequiredOutcome && c.blockId && c.sourceText.startsWith("-"),
    ),
  ).toBe(true);
  expect(a.learningOutcomes).toEqual([]); // Categorized requirements are not duplicated as unrelated objectives.
});
it("detects explicit learning outcomes, knowledge and skills without duplication", async () => {
  const { a } = await analyze([
    "I. YÊU CẦU CẦN ĐẠT",
    "- Nhận biết mẫu.",
    "1. Kiến thức, kĩ năng",
    "- So sánh hai mẫu.",
  ]);
  expect(a.learningOutcomes).toEqual(["Nhận biết mẫu."]);
  expect(a.knowledgeObjectives).toEqual(["So sánh hai mẫu."]);
});
it("never infers a missing grade or fabricates objectives from time", async () => {
  const { a } = await analyze(["Số tiết: 3 tiết", "Mỗi tiết 35 phút"]);
  expect(a.curriculumGrade).toBe("");
  expect(a.targetAudienceGrade).toBe("");
  expect(gradeEvidence(a, "curriculumGrade").source).toBe("UNKNOWN");
  expect(a.learningOutcomes).toEqual([]);
  expect(a.knowledgeObjectives).toEqual([]);
});
it("round-trips new evidence and accepts older analysis JSON", async () => {
  const { a } = await analyze([
    "TIN HỌC 3",
    "Số tiết 3 tiết",
    "Mỗi tiết 35 phút",
  ]);
  expect(deserializeAnalysis(serializeAnalysis(a))).toEqual(a);
  const old = { ...a };
  delete old.periodCount;
  delete old.minutesPerPeriod;
  delete old.totalDurationMinutes;
  delete old.lessonNumber;
  expect(deserializeAnalysis(JSON.stringify(old)).curriculumGrade).toBe("3");
});

it("preserves the existing colon-title contract while recovering its lesson number", async () => {
  const { a } = await analyze(["Bài 9: Bài học tổng hợp"]);
  expect(a.lessonTitle).toBe("Bài học tổng hợp");
  expect(a.lessonNumber).toBe(9);
});
it("recovers an explicit minute duration without colon labels", async () => {
  const { a } = await analyze(["Thời lượng 50 phút"]);
  expect(a.totalDurationMinutes).toBe(50);
});
it("retains explicit conflicting total and warns instead of silently replacing it", async () => {
  const { a } = await analyze([
    "Thời lượng: 90 phút",
    "Số tiết: 3 tiết",
    "Mỗi tiết 35 phút",
  ]);
  expect(a.totalDurationMinutes).toBe(90);
  expect(a.sourceWarnings.some((w) => /90.*105/.test(w))).toBe(true);
});
it("reports categorized required outcomes without a false missing-outcome warning", async () => {
  const { a } = await analyze([
    "I. YÊU CẦU CẦN ĐẠT",
    "Năng lực Tin học:",
    "- Thao tác với thiết bị.",
  ]);
  const { analysisWarnings } = await import("../src/import/review");
  expect(analysisWarnings(a).some((w) => w.code === "OUTCOMES")).toBe(false);
});
it("recovers the same metadata and periods for pasted source with block evidence", async () => {
  const { importPastedPlan } = await import("../src/import/documents");
  const a = await new DeterministicLessonAnalysisProvider().analyze(
    importPastedPlan(
      "TIN HỌC 3\nBÀI 4. Bài học tổng hợp\nSố tiết 3 tiết\nMỗi tiết 35 phút",
    ),
  );
  expect(a).toMatchObject({
    curriculumGrade: "3",
    lessonNumber: 4,
    periodCount: 3,
    minutesPerPeriod: 35,
    totalDurationMinutes: 105,
  });
  expect(a.unmappedContent).toEqual([]);
  expect(
    a.sourceTraces
      .filter((t) => t.field === "curriculumGrade")
      .every((t) => t.blockId),
  ).toBe(true);
});
it("does not treat an activity mentioning a grade or periods as metadata", async () => {
  const { a } = await analyze([
    "III. CÁC HOẠT ĐỘNG DẠY HỌC",
    "Thực hành (5 phút)",
    "GV nhắc lớp 4 thực hiện trong 3 tiết.",
  ]);
  expect(a.curriculumGrade).toBe("");
  expect(a.periodCount).toBeNull();
});

it("keeps alphabetic c) and d) headings within the required-outcome parent", async () => {
  const { a } = await analyze([
    "I. YÊU CẦU CẦN ĐẠT",
    "1. Năng lực",
    "a) Năng lực Tin học:",
    "- Thao tác thiết bị.",
    "b) Năng lực số:",
    "- Dùng dữ liệu an toàn.",
    "c) Năng lực AI:",
    "- Nhận biết trợ lý AI.",
    "d) Năng lực chung:",
    "- Hợp tác nhóm.",
    "2. Phẩm chất:",
    "- Trung thực.",
  ]);
  const { requiredOutcomeStatements, outcomeSummaryCount } =
    await import("../src/import/outcomes");
  expect(requiredOutcomeStatements(a)).toHaveLength(5);
  expect(outcomeSummaryCount(a)).toBe(5);
  expect(a.learningOutcomes).toEqual([]);
});
it("renders categorized requirements instead of a misleading zero summary", async () => {
  const { a } = await analyze([
    "I. YÊU CẦU CẦN ĐẠT",
    "Năng lực Tin học:",
    "- Thao tác thiết bị.",
  ]);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { AnalysisReview } = await import("../src/import/AnalysisReview");
  const html = renderToStaticMarkup(
    createElement(AnalysisReview, {
      analysis: a,
      edit: () => {},
      back: () => {},
      reanalyze: () => {},
      confirm: () => {},
    }),
  );
  expect(html).toMatch(/1 yêu cầu/);
  expect(html).toContain("Các mục được giữ riêng");
});

it("keeps the provenance of an explicit total distinct from conflicting derived time", async () => {
  const { a } = await analyze([
    "Thời lượng: 90 phút",
    "Số tiết: 3 tiết",
    "Mỗi tiết 35 phút",
  ]);
  expect(
    a.sourceTraces
      .filter((t) => t.field === "totalDurationMinutes")
      .map((t) => t.sourceText),
  ).toEqual(["Thời lượng: 90 phút"]);
});
it("keeps activity and total compatibility fields synchronized after teacher edits", async () => {
  const { a } = await analyze(["Thời lượng: 35 phút", "Khởi động (5 phút)"]);
  const { editAnalysis } = await import("../src/import/review");
  const changedTotal = editAnalysis(a, "durationMinutes", 40);
  expect(changedTotal.totalDurationMinutes).toBe(40);
  const changedActivity = editAnalysis(
    a,
    "teachingActivities",
    a.teachingActivities.map((t) => ({ ...t, estimatedMinutes: 8 })),
  );
  expect(changedActivity.teachingActivities[0].activityDurationMinutes).toBe(8);
});
it("preserves every synthetic source block including uncertain and metadata content", async () => {
  const { a, document } = await analyze([
    "TIN HỌC 3",
    "BÀI 4. Bài học tổng hợp",
    "Số tiết 3 tiết",
    "Mỗi tiết 35 phút",
    "I. YÊU CẦU CẦN ĐẠT",
    "Năng lực AI:",
    "- Nhận biết trợ lý AI.",
    "II. MỤC CHƯA HỖ TRỢ",
    "Nội dung cần giáo viên xem.",
  ]);
  for (const block of document.blocks)
    expect(
      a.classifications.some(
        (c) => c.blockId === block.id && c.sourceText === block.text,
      ),
    ).toBe(true);
});
