import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { importPlanFile } from "../src/import/documents";
import {
  parseDuration,
  DeterministicLessonAnalysisProvider,
} from "../src/import/analyzer";
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (texts: string[], span = 1) =>
  `<w:tc><w:tcPr><w:gridSpan w:val="${span}"/></w:tcPr>${texts.map(p).join("")}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
export async function structuralFixture() {
  const names = [
    "Khởi động",
    "Hình thành kiến thức",
    "Luyện tập",
    "Vận dụng",
    "Củng cố, dặn dò",
  ];
  const minutes = [5, 17, 5, 5, 3];
  const rows = [
    row(
      cell(["Hoạt động của giáo viên"]),
      cell(["Hoạt động của học sinh"]),
      cell(["Hỗ trợ", "HSKT"]),
    ),
  ];
  names.forEach((name, i) => {
    rows.push(
      row(
        cell(
          [
            `${i + 1}. ${name.toUpperCase()} (${minutes[i]}’)`,
            "a. Mục tiêu: Học sinh thực hiện nhiệm vụ.",
            "b. Cách tiến hành",
            ...(i === 4
              ? [
                  "Củng cố",
                  "Nhắc lại điều đã học.",
                  "Dặn dò",
                  "Chuẩn bị bài sau.",
                ]
              : []),
          ],
          3,
        ),
      ),
    );
    if (i === 1)
      rows.push(
        row(
          cell(
            [
              "1. Nhóm kiến thức thứ nhất (9’)",
              "Hoạt động 1. Quan sát mẫu",
              "a. Mục tiêu: Nhận biết dấu hiệu.",
              "b. Cách tiến hành",
            ],
            3,
          ),
        ),
      );
    rows.push(
      row(
        cell([
          `GV nêu nhiệm vụ ${i + 1}.`,
          "Câu hỏi mẫu?",
          "A. Lựa chọn một.",
          "B. Lựa chọn hai.",
        ]),
        cell([`HS trả lời ${i + 1}.`, "Đáp án B."]),
        cell([`Hỗ trợ riêng ${i + 1}.`]),
      ),
    );
    if (i === 1) {
      rows.push(
        row(
          cell(
            [
              "2. Nhóm kiến thức thứ hai (8’)",
              "Hoạt động 2. So sánh mẫu",
              "a. Mục tiêu: So sánh dấu hiệu.",
              "b. Cách tiến hành",
            ],
            3,
          ),
        ),
      );
      rows.push(
        row(
          cell(["GV hướng dẫn so sánh."]),
          cell(["HS so sánh."]),
          cell(["Gợi ý trực quan."]),
        ),
      );
    }
  });
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${["Bài 7: Bài học kiểm thử (T1)", "I. YÊU CẦU CẦN ĐẠT", "1. Kiến thức, kĩ năng.", "Sau bài này, HS sẽ:", "- Nhận biết được đặc điểm của mẫu.", "- So sánh được hai mẫu.", "2. Năng lực.", "- Hợp tác trong nhóm.", "III. CÁC HOẠT ĐỘNG DẠY – HỌC"].map(p).join("")}<w:tbl>${rows.join("")}</w:tbl></w:body></w:document>`;
  const bytes = zipSync({ "word/document.xml": strToU8(xml) });
  const document = await importPlanFile({
    name: "sanitized.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const analysis = await new DeterministicLessonAnalysisProvider().analyze(
    document,
  );
  return { document, analysis };
}
describe("Phase 2G.1 structural recovery (synthetic, no teacher text)", () => {
  it("recovers five ordered activities and parent/subdivision time without double counting", async () => {
    const { analysis: a } = await structuralFixture();
    expect(a.teachingActivities.map((x) => x.estimatedMinutes)).toEqual([
      5, 17, 5, 5, 3,
    ]);
    expect(a.teachingActivities.map((x) => x.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("KHỞI ĐỘNG"),
        expect.stringContaining("CỦNG CỐ"),
      ]),
    );
    expect(a.durationMinutes).toBe(35);
    expect(a.teachingActivities[1]).toMatchObject({
      subactivities: [{ estimatedMinutes: 9 }, { estimatedMinutes: 8 }],
    });
  });
  it("separates objectives, actions, support and preserves provenance and original answers", async () => {
    const { analysis: a, document: d } = await structuralFixture();
    expect(a.knowledgeObjectives).toEqual([
      "Nhận biết được đặc điểm của mẫu.",
      "So sánh được hai mẫu.",
    ]);
    expect(a.learningOutcomes).not.toContain("1. Kiến thức, kĩ năng.");
    expect(a.specialNeedsSupport).toContain("Hỗ trợ riêng 3.");
    expect(a.teachingActivities[2]).toMatchObject({
      teacherActivity: expect.arrayContaining([
        "Câu hỏi mẫu?",
        "B. Lựa chọn hai.",
      ]),
      studentActivity: expect.arrayContaining(["Đáp án B."]),
      specialNeedsSupport: ["Hỗ trợ riêng 3."],
    });
    expect(
      a.sourceTraces.filter((x) => x.sourceText.includes("Hỗ trợ riêng 3.")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: d.blocks.at(-1)!.id, column: 2 }),
      ]),
    );
  });
});

it.each(["5’", "17′", "9'", "8 phút"])(
  "recognizes explicit minute notation %s",
  (value) => {
    expect(parseDuration(value)).toBe(Number.parseInt(value));
  },
);
it("preserves every synthetic source paragraph with its block/cell provenance", async () => {
  const { document, analysis } = await structuralFixture();
  for (const block of document.blocks) {
    const entries = block.table
      ? block.table.rows.flatMap((row, r) =>
          row.cells.flatMap((cell) =>
            (cell.paragraphs ?? [cell.text]).map((text) => ({
              text,
              row: r,
              column: cell.column,
            })),
          ),
        )
      : [{ text: block.text ?? "", row: undefined, column: undefined }];
    for (const entry of entries)
      expect(
        analysis.classifications.some(
          (c) =>
            c.blockId === block.id &&
            c.row === entry.row &&
            c.column === entry.column &&
            c.sourceText.includes(entry.text),
        ),
        entry.text,
      ).toBe(true);
  }
});
it("does not count subsection times twice or infer a partial lesson duration", async () => {
  const { document } = await structuralFixture();
  const partial = JSON.parse(
    JSON.stringify(document).replaceAll("17’", "chưa rõ"),
  );
  const a = await new DeterministicLessonAnalysisProvider().analyze(partial);
  expect(a.teachingActivities).toHaveLength(5);
  expect(a.teachingActivities[1].estimatedMinutes).toBeNull();
  expect(a.durationMinutes).toBeNull();
  expect(
    a.teachingActivities[1].subactivities?.map((s) => s.estimatedMinutes),
  ).toEqual([9, 8]);
});

it("retains the source lesson number and expands the session abbreviation in the title", async () => {
  const { analysis } = await structuralFixture();
  expect(analysis.lessonTitle).toBe("Bài 7 — Bài học kiểm thử (Tiết 1)");
  expect(
    analysis.sourceTraces.some(
      (t) =>
        t.field === "lessonTitle" &&
        t.sourceText.includes("Bài 7: Bài học kiểm thử (T1)"),
    ),
  ).toBe(true);
});
