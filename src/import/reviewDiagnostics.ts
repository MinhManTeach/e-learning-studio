import type { BlockClassification, PedagogicalAnalysis } from "./model";
import { periodReviewWarnings } from "../blueprint/periods";
import { analysisWarnings } from "./review";

export type ReviewSeverity = "BLOCKING" | "REVIEW" | "INFORMATIONAL";
export function continuationDiagnostics(
  a: PedagogicalAnalysis,
  reviewed: boolean,
) {
  const diagnostics: {
    code: string;
    field: string;
    severity: ReviewSeverity;
    message: string;
  }[] = [];
  if (!reviewed)
    diagnostics.push({
      code: "RESPONSIBILITY",
      field: "responsibility",
      severity: "BLOCKING",
      message: "Đánh dấu xác nhận trách nhiệm sau khi hoàn tất chỉnh sửa.",
    });
  for (const w of periodReviewWarnings(a))
    diagnostics.push({
      ...w,
      field: "periodReview",
      severity: w.severity === "ERROR" ? "BLOCKING" : "REVIEW",
    });
  for (const w of analysisWarnings(a))
    diagnostics.push({ ...w, field: "analysis", severity: "REVIEW" });
  return diagnostics;
}
const groupLabels = {
  metadata: "Thông tin bài học",
  outcomes: "Yêu cầu cần đạt",
  competencies: "Năng lực & phẩm chất",
  activities: "Hoạt động dạy học",
  assessment: "Đánh giá",
  worksheets: "Phiếu học tập",
  other: "Ghi chú nguồn khác",
};
type GroupKey = keyof typeof groupLabels;
type SourceReviewItem = {
  id: string;
  text: string;
  blockId?: string;
  confidence?: number;
  classification?: BlockClassification;
  severity: ReviewSeverity;
};
function groupFor(c?: BlockClassification, text = ""): GroupKey {
  if (/phiếu\s+(?:học tập|bài tập)|worksheet/iu.test(text)) return "worksheets";
  switch (c?.category) {
    case "LESSON_IDENTITY":
      return "metadata";
    case "LEARNING_OUTCOME":
    case "KNOWLEDGE":
      return "outcomes";
    case "COMPETENCY":
    case "QUALITY":
      return "competencies";
    case "TEACHING_ACTIVITY":
    case "TEACHER_ACTIVITY":
    case "STUDENT_ACTIVITY":
    case "WARMUP":
    case "DISCOVERY":
    case "PRACTICE":
    case "APPLICATION":
      return "activities";
    case "ASSESSMENT":
      return "assessment";
    default:
      return "other";
  }
}
export function groupedSourceReview(a: PedagogicalAnalysis) {
  const groups = (Object.entries(groupLabels) as [GroupKey, string][]).map(
    ([key, label]) => ({ key, label, items: [] as SourceReviewItem[] }),
  );
  const used = new Set<string>();
  const push = (item: SourceReviewItem) =>
    groups
      .find((g) => g.key === groupFor(item.classification, item.text))!
      .items.push(item);
  // Current teacher-edited values remain authoritative; source classifications stay intact.
  a.unmappedContent.forEach((text, i) => {
    const c =
      a.classifications.find(
        (c) =>
          !used.has(c.id) &&
          c.field === `unmappedContent[${i}]` &&
          c.sourceText === text,
      ) ??
      a.classifications.find((c) => !used.has(c.id) && c.sourceText === text);
    if (c) used.add(c.id);
    const trace = a.sourceTraces.find(
      (t) => t.field === `unmappedContent[${i}]` && t.sourceText === text,
    );
    push({
      id: `unmapped-${i}`,
      text,
      classification: c,
      blockId: c?.blockId ?? trace?.blockId,
      confidence: c?.confidence ?? trace?.confidence,
      severity: c?.corrected ? "INFORMATIONAL" : "REVIEW",
    });
  });
  a.classifications
    .filter(
      (c) =>
        !used.has(c.id) &&
        !c.isHeading &&
        (c.needsReview ||
          c.corrected ||
          (c.confidence >= 0.6 && c.confidence < 0.85)),
    )
    .forEach((c) =>
      push({
        id: c.id,
        text: c.sourceText,
        blockId: c.blockId,
        confidence: c.confidence,
        classification: c,
        severity: c.corrected ? "INFORMATIONAL" : "REVIEW",
      }),
    );
  return groups;
}
