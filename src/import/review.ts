import { analysisSchema, type PedagogicalAnalysis } from "./model";
export type AnalysisWarning = { code: string; message: string };
export function analysisWarnings(a: PedagogicalAnalysis): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];
  if (!a.subject.trim())
    warnings.push({
      code: "SUBJECT",
      message: "Chưa phát hiện môn học trong kế hoạch bài dạy.",
    });
  if (!a.lessonTitle.trim())
    warnings.push({ code: "TITLE", message: "Chưa phát hiện tên bài học." });
  if (a.durationMinutes === null)
    warnings.push({
      code: "DURATION",
      message: "Chưa phát hiện thời lượng bài học theo phút.",
    });
  if (!a.learningOutcomes.some((x) => x.trim()))
    warnings.push({
      code: "OUTCOMES",
      message: "Chưa phát hiện yêu cầu cần đạt.",
    });
  if (!a.assessmentEvidence.some((x) => x.trim()))
    warnings.push({
      code: "ASSESSMENT",
      message: "Chưa phát hiện nội dung đánh giá.",
    });
  if (
    a.curriculumGrade &&
    a.targetAudienceGrade &&
    a.curriculumGrade !== a.targetAudienceGrade
  )
    warnings.push({
      code: "GRADE_MISMATCH",
      message: `Lớp chương trình (${a.curriculumGrade}) và đối tượng học sinh (${a.targetAudienceGrade}) không trùng nhau. Thầy/cô hãy kiểm tra.`,
    });
  return [
    ...warnings,
    ...a.sourceWarnings.map((message, i) => ({ code: `SOURCE_${i}`, message })),
  ];
}
export function editAnalysis<K extends keyof PedagogicalAnalysis>(
  a: PedagogicalAnalysis,
  field: K,
  value: PedagogicalAnalysis[K],
): PedagogicalAnalysis {
  return analysisSchema.parse({
    ...a,
    [field]: value,
    teacherEditedFields: [...new Set([...a.teacherEditedFields, field])],
  });
}
export interface AnalysisDraft {
  document: import("./model").ImportedLessonDocument;
  analysis: PedagogicalAnalysis;
  confirmedAt: string | null;
}
export function confirmAnalysis(
  draft: AnalysisDraft,
  teacherReviewed: boolean,
): AnalysisDraft {
  if (!teacherReviewed)
    throw new Error("Thầy/cô cần kiểm tra nội dung trước khi xác nhận.");
  analysisSchema.parse(draft.analysis);
  if (draft.analysis.sourceDocumentId !== draft.document.id)
    throw new Error(
      "Nội dung phân tích không khớp kế hoạch nguồn. Hãy phân tích lại.",
    );
  return { ...draft, confirmedAt: new Date().toISOString() };
}
