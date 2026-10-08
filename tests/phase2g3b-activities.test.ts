import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { importPlanFile } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
const p = (t: string) => "<w:p><w:r><w:t>" + t + "</w:t></w:r></w:p>";
const cell = (texts: string[], span = 1) =>
  '<w:tc><w:tcPr><w:gridSpan w:val="' +
  span +
  '"/></w:tcPr>' +
  texts.map(p).join("") +
  "</w:tc>";
const row = (...cells: string[]) => "<w:tr>" + cells.join("") + "</w:tr>";
const table = (...rows: string[]) => "<w:tbl>" + rows.join("") + "</w:tbl>";
async function analyze(body: string) {
  const bytes = zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        body +
        "</w:body></w:document>",
    ),
  });
  const document = await importPlanFile({
    name: "synthetic.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  return {
    document,
    a: await new DeterministicLessonAnalysisProvider().analyze(document),
  };
}
const roles = () =>
  row(
    cell(["Hoạt động của GV"], 2),
    cell(["Hoạt động của HS"], 2),
    cell(["HSKT"]),
  );
it("maps horizontal merged headers per cell with complete provenance", async () => {
  const { a, document } = await analyze(
    table(
      roles(),
      row(cell(["1. Khởi động (5 phút)"], 5)),
      row(
        cell(["Giới thiệu mẫu.", "Đặt câu hỏi."], 2),
        cell(["Quan sát mẫu."], 2),
        cell(["Hỗ trợ trực quan."]),
      ),
    ),
  );
  expect(a.teachingActivities[0].teacherActivity).toEqual([
    "Giới thiệu mẫu.",
    "Đặt câu hỏi.",
  ]);
  expect(a.teachingActivities[0].studentActivity).toEqual(["Quan sát mẫu."]);
  expect(a.teachingActivities[0].specialNeedsSupport).toEqual([
    "Hỗ trợ trực quan.",
  ]);
  expect(a.teachingActivities[0].source).toMatchObject({
    blockId: document.blocks[0].id,
    tableIndex: 0,
    row: 1,
    column: 0,
    sourceText: "1. Khởi động (5 phút)",
    needsReview: false,
  });
  expect(
    a.classifications.find((c) => c.sourceText === "Quan sát mẫu."),
  ).toMatchObject({
    tableIndex: 0,
    row: 2,
    column: 2,
    category: "STUDENT_ACTIVITY",
    needsReview: false,
  });
});
it("recovers explicit roles when row boundaries change without applying a global complex flag", async () => {
  const { a } = await analyze(
    p("Khởi động") +
      table(
        row(cell(["Hoạt động của GV"], 1), cell(["Hoạt động của HS"], 3)),
        row(cell(["GV: Hướng dẫn."], 3), cell(["HS: Thực hiện."], 1)),
        row(cell(["GV: Gợi ý."], 2), cell(["HS: Trả lời."], 2)),
      ),
  );
  expect(a.teachingActivities[0].teacherActivity).toEqual([
    "GV: Hướng dẫn.",
    "GV: Gợi ý.",
  ]);
  expect(a.teachingActivities[0].studentActivity).toEqual([
    "HS: Thực hiện.",
    "HS: Trả lời.",
  ]);
});
it("keeps crossing cells without explicit role evidence uncertain while mapping safe neighboring rows", async () => {
  const { a } = await analyze(
    p("Khởi động") +
      table(
        row(cell(["Hoạt động của GV"], 2), cell(["Hoạt động của HS"], 2)),
        row(cell(["Nội dung giao nhiều vai trò."], 3), cell(["Phản hồi."], 1)),
        row(cell(["Hướng dẫn riêng."], 2), cell(["Quan sát."], 2)),
      ),
  );
  expect(a.unmappedContent).toContain("Nội dung giao nhiều vai trò.");
  expect(a.teachingActivities[0].teacherActivity).toEqual(["Hướng dẫn riêng."]);
  expect(a.teachingActivities[0].studentActivity).toEqual([
    "Phản hồi.",
    "Quan sát.",
  ]);
  expect(
    a.classifications.find(
      (c) => c.sourceText === "Nội dung giao nhiều vai trò.",
    ),
  ).toMatchObject({ needsReview: true, tableIndex: 0, row: 1, column: 0 });
});
it("separates explicit GV HS and HSKT paragraphs inside one spanning cell", async () => {
  const { a } = await analyze(
    p("Khởi động") +
      table(
        roles(),
        row(
          cell(
            [
              "GV: Hướng dẫn.",
              "HS: Quan sát.",
              "HSKT: Dùng mẫu lớn.",
              "Nội dung chưa rõ vai trò.",
            ],
            5,
          ),
        ),
      ),
  );
  expect(a.teachingActivities[0].teacherActivity).toEqual(["GV: Hướng dẫn."]);
  expect(a.teachingActivities[0].studentActivity).toEqual(["HS: Quan sát."]);
  expect(a.teachingActivities[0].specialNeedsSupport).toEqual([
    "HSKT: Dùng mẫu lớn.",
  ]);
  expect(a.unmappedContent).toContain("Nội dung chưa rõ vai trò.");
});
it.each([
  "1.. Khởi động (5 phút)",
  "2. Khám phá kiến thức (15 phút)",
  "2. Khám phá kiến thức 3: Quan sát mẫu (15 phút)",
  "3) Hình thành kiến thức (10 phút)",
  "4.. Luyện tập (3 phút)",
  "4. Vận dụng (",
  "Củng cố / Dặn dò (3 phút)",
])(
  "recognizes malformed/extended activity heading %s and retains its original text",
  async (title) => {
    const { a } = await analyze(table(row(cell([title], 4))));
    expect(a.teachingActivities).toHaveLength(1);
    expect(a.teachingActivities[0].source?.sourceText).toBe(title);
    expect(a.teachingActivities[0].source?.tableIndex).toBe(0);
  },
);
it("does not create activities for introductions dotted lines notes assessment or worksheets", async () => {
  const { a } = await analyze(
    [
      "III. CÁC HOẠT ĐỘNG DẠY HỌC",
      "Phân bổ thời lượng: 3 tiết, mỗi tiết 35 phút.",
      "...........",
      "Ghi chú của giáo viên:",
      "Chuẩn bị thêm mẫu.",
      "VI. ĐÁNH GIÁ SAU BÀI HỌC",
      "Tiêu chí quan sát.",
      "VII. PHIẾU HỌC TẬP",
      "Phiếu thực hành.",
    ]
      .map(p)
      .join(""),
  );
  expect(a.teachingActivities).toEqual([]);
  expect(a.unmappedContent.join(" ")).toContain("Chuẩn bị thêm mẫu.");
});
it("groups activities by explicit source periods and keeps the declared period count", async () => {
  const { a } = await analyze(
    [
      "Số tiết: 3 tiết",
      "Mỗi tiết 35 phút",
      "TIẾT 1",
      "Khởi động (5 phút)",
      "TIẾT 2",
      "Thực hành (10 phút)",
    ]
      .map(p)
      .join(""),
  );
  expect(a.periodCount).toBe(3);
  expect(a.totalDurationMinutes).toBe(105);
  expect(a.teachingPeriods?.map((t) => t.number)).toEqual([1, 2]);
  expect(a.teachingPeriods?.map((t) => t.durationMinutes)).toEqual([35, 35]);
  expect(a.teachingActivities.map((t) => t.periodId)).toEqual(
    a.teachingPeriods?.map((t) => t.id),
  );
  expect(a.sourceWarnings.some((w) => /3.*2|2.*3/.test(w))).toBe(true);
});
it("retains parent and child times without double counting and flags conflicting children", async () => {
  const { a } = await analyze(
    p("TIẾT 1 (35 phút)") +
      table(
        row(cell(["Thực hành (10 phút)"], 2)),
        row(cell(["1. Quan sát (8 phút)"], 2)),
        row(cell(["2. Thao tác (7 phút)"], 2)),
      ),
  );
  expect(a.teachingActivities).toHaveLength(1);
  expect(a.teachingActivities[0].estimatedMinutes).toBe(10);
  expect(
    a.teachingActivities[0].subactivities?.map((t) => t.estimatedMinutes),
  ).toEqual([8, 7]);
  expect(a.durationMinutes).toBe(10);
  expect(a.sourceWarnings.some((w) => /15.*10|10.*15/.test(w))).toBe(true);
});
it("retains nested irregular content for review without guessing its role", async () => {
  const nested =
    "<w:tc>" +
    p("Bảng con") +
    table(row(cell(["GV con"]), cell(["HS con"]))) +
    "</w:tc>";
  const { a } = await analyze(
    p("Khởi động") +
      table(
        row(cell(["Hoạt động của GV"]), cell(["Hoạt động của HS"])),
        row(nested, cell(["Quan sát."])),
      ),
  );
  expect(a.unmappedContent.join(" ")).toContain("HS con");
  expect(a.teachingActivities[0].teacherActivity).toEqual([]);
});
it("preserves every source paragraph including ambiguous cells and original headings", async () => {
  const { a, document } = await analyze(
    p("TIẾT 1") +
      table(
        roles(),
        row(cell(["3.. Luyện tập (3 phút)"], 5)),
        row(
          cell(["GV: Câu hỏi.", "Chưa rõ vai trò."], 3),
          cell(["Quan sát."], 1),
          cell(["Gợi ý."]),
        ),
      ),
  );
  for (const b of document.blocks) {
    const texts = b.table
      ? b.table.rows.flatMap((r) =>
          r.cells.flatMap((c) => c.paragraphs ?? [c.text]),
        )
      : [b.text ?? ""];
    for (const t of texts.filter((t) => t.trim()))
      expect(
        a.classifications.some(
          (c) => c.blockId === b.id && c.sourceText.includes(t),
        ),
        t,
      ).toBe(true);
  }
});

it("recovers child task titles from the first cell of multi-role rows without making parent activities", async () => {
  const { a } = await analyze(
    p("TIẾT 1") +
      table(
        row(cell(["Hoạt động của GV"], 2), cell(["Hoạt động của HS"], 2)),
        row(cell(["Thực hành (8 phút)"], 4)),
        row(
          cell(["1. Quan sát mẫu", "GV: Hướng dẫn."], 2),
          cell(["HS: Quan sát."], 2),
        ),
        row(
          cell(["2. Thao tác (12 phút)", "GV: Gợi ý."], 3),
          cell(["HS: Thực hiện."], 1),
        ),
      ),
  );
  expect(a.teachingActivities).toHaveLength(1);
  expect(
    a.teachingActivities[0].subactivities?.map((s) => s.estimatedMinutes),
  ).toEqual([null, 12]);
  expect(a.teachingActivities[0].subactivities?.[1].source).toMatchObject({
    tableIndex: 0,
    row: 3,
    column: 0,
    sourceText: "2. Thao tác (12 phút)",
  });
  expect(a.teachingActivities[0].teacherActivity).toContain("GV: Gợi ý.");
});
it("keeps HSKT support separate even when explicitly labelled inside a teacher column", async () => {
  const { a } = await analyze(
    p("Khởi động") +
      table(
        row(cell(["GV"]), cell(["HS"])),
        row(
          cell(["GV: Hướng dẫn.", "HSKT: Dùng mẫu lớn."]),
          cell(["HS: Thực hiện."]),
        ),
      ),
  );
  expect(a.teachingActivities[0].specialNeedsSupport).toEqual([
    "HSKT: Dùng mẫu lớn.",
  ]);
  expect(a.teachingActivities[0].teacherActivity).toEqual(["GV: Hướng dẫn."]);
});
it("preserves an unlabeled ambiguous cell as one review item without losing its paragraphs", async () => {
  const { a } = await analyze(
    p("Khởi động") +
      table(
        row(cell(["GV"]), cell(["HS"])),
        row(cell(["Chưa rõ một.", "Chưa rõ hai."], 2)),
      ),
  );
  expect(a.unmappedContent).toEqual(["Chưa rõ một.\nChưa rõ hai."]);
});
it("retains TUẦN 5 subject grade title and five ordered activities", async () => {
  const { a } = await analyze(
    [
      "GIÁO ÁN TUẦN 5 – TIN HỌC 3",
      "Bài 7: Bài học tổng hợp (T1)",
      "Khởi động (5 phút)",
      "Hình thành kiến thức (17 phút)",
      "Luyện tập (5 phút)",
      "Vận dụng (5 phút)",
      "Củng cố, dặn dò (3 phút)",
    ]
      .map(p)
      .join(""),
  );
  expect(a).toMatchObject({
    subject: "TIN HỌC",
    curriculumGrade: "3",
    lessonTitle: "Bài 7 — Bài học tổng hợp (Tiết 1)",
    durationMinutes: 35,
  });
  expect(a.teachingActivities.map((t) => t.estimatedMinutes)).toEqual([
    5, 17, 5, 5, 3,
  ]);
});
it("does not resolve a contradictory GV label inside an unambiguous HS cell silently", async () => {
  const { a } = await analyze(
    p("Khởi động") +
      table(
        row(cell(["GV"]), cell(["HS"])),
        row(cell(["Hướng dẫn."]), cell(["GV: Nội dung mâu thuẫn."])),
      ),
  );
  expect(a.unmappedContent).toContain("GV: Nội dung mâu thuẫn.");
  expect(a.teachingActivities[0].studentActivity).toEqual([]);
});

it("retains explicit period-duration provenance and leaves a bare bracketed number unresolved", async () => {
  const { a } = await analyze(
    [
      p("TIẾT 1 (35 phút)"),
      p("Khởi động (5 phút)"),
      p("TIẾT 2 (35)"),
      p("Thực hành (5 phút)"),
    ].join(""),
  );
  expect(a.teachingPeriods?.[0].durationSource?.[0].sourceText).toBe(
    "TIẾT 1 (35 phút)",
  );
  expect(a.teachingPeriods?.[1].durationMinutes).toBeNull();
});
it("preserves source metadata on named activity-column entries", async () => {
  const { a } = await analyze(
    p("III. CÁC HOẠT ĐỘNG DẠY HỌC") +
      table(
        row(cell(["Hoạt động"]), cell(["Nội dung"])),
        row(cell(["Quan sát mẫu"]), cell(["Nhiệm vụ."])),
      ),
  );
  expect(a.teachingActivities[0].source).toMatchObject({
    tableIndex: 0,
    row: 1,
    column: 0,
    sourceText: "Quan sát mẫu",
  });
});
it("does not create named activities from a worksheet heading in an activity column", async () => {
  const { a } = await analyze(
    p("III. CÁC HOẠT ĐỘNG DẠY HỌC") +
      table(
        row(cell(["Hoạt động"]), cell(["Nội dung"])),
        row(cell(["PHIẾU HỌC TẬP"]), cell(["Nhiệm vụ."])),
      ),
  );
  expect(a.teachingActivities).toEqual([]);
});
it("rejects time introductions and dotted blanks in an activity column", async () => {
  const { a } = await analyze(
    p("III. CÁC HOẠT ĐỘNG DẠY HỌC") +
      table(
        row(cell(["Hoạt động"]), cell(["Nội dung"])),
        row(cell(["Phân bổ thời lượng: 3 tiết"]), cell(["Giới thiệu."])),
        row(cell(["........"]), cell(["Ghi chú."])),
      ),
  );
  expect(a.teachingActivities).toEqual([]);
});
