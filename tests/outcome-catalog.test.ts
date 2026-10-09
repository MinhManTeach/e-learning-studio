import { describe, expect, it } from "vitest";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { importPastedPlan } from "../src/import/documents";
import { outcomeCatalog } from "../src/blueprint/model";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";

// GDPT 2018 plans often list the measurable requirements only under
// "Năng lực đặc thù / Năng lực <môn>", with no separate knowledge section.
const plan = `BÀI 4. LÀM VIỆC VỚI MÁY TÍNH
Môn học: Tin học
Lớp: 3
I. YÊU CẦU CẦN ĐẠT
1. Năng lực
a) Năng lực Tin học:
- Biết và ngồi đúng tư thế khi làm việc với máy tính.
- Biết cầm chuột đúng cách và thực hiện được các thao tác cơ bản với chuột.
b) Năng lực chung:
- Giao tiếp và hợp tác: Trao đổi nhóm đôi để nhận xét tư thế ngồi.
2. Phẩm chất
- Chăm chỉ: Tích cực luyện tập thao tác.
II. CÁC HOẠT ĐỘNG DẠY HỌC
1. Khởi động (5 phút)
- Học sinh kể tên các bộ phận của máy tính.
2. Khám phá (15 phút)
- Học sinh quan sát tranh và nhận xét tư thế ngồi.`;

// The structured (DOCX) classifier reads these headings; pasted text uses the
// plain-text analyzer, so the same paragraphs are analyzed as a DOCX source.
async function analyze() {
  return new DeterministicLessonAnalysisProvider().analyze({
    ...importPastedPlan(plan),
    sourceType: "DOCX",
  });
}

describe("outcome catalog", () => {
  it("uses subject-specific competencies when no knowledge section exists", async () => {
    const a = await analyze();
    expect(a.learningOutcomes.filter((x) => x.trim())).toEqual([]);
    expect(a.knowledgeObjectives.filter((x) => x.trim())).toEqual([]);
    expect(outcomeCatalog(a).map((o) => o.text)).toEqual([
      "Biết và ngồi đúng tư thế khi làm việc với máy tính.",
      "Biết cầm chuột đúng cách và thực hiện được các thao tác cơ bản với chuột.",
    ]);
  });
  it("keeps IDs pointing at the original competency index", async () => {
    const a = await analyze();
    for (const o of outcomeCatalog(a)) {
      const [, field, n] = o.id.split(":");
      expect(field).toBe("competencies");
      expect(a.competencies[Number(n) - 1]).toBe(o.text);
    }
  });
  it("puts those requirements on the objectives slide instead of a placeholder", async () => {
    const b = await new DeterministicLessonBlueprintProvider().generate(
      await analyze(),
    );
    const objectives = b.proposedSlides.find((s) => s.type === "OBJECTIVES");
    expect(objectives?.contentOutline.join(" ")).toContain("ngồi đúng tư thế");
    expect(objectives?.contentOutline).not.toContain(
      "Cùng giáo viên xác định mục tiêu bài học",
    );
  });
});
