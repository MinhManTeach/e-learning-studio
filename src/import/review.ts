import { analysisSchema, type PedagogicalAnalysis } from "./model";
import { activitySchema, type BlockClassification } from "./model";
export const correctionCategories: {
  value: BlockClassification["category"];
  label: string;
  field: string;
}[] = [
  {
    value: "LEARNING_OUTCOME",
    label: "Yêu cầu cần đạt",
    field: "learningOutcomes",
  },
  { value: "KNOWLEDGE", label: "Kiến thức", field: "knowledgeObjectives" },
  { value: "COMPETENCY", label: "Năng lực", field: "competencies" },
  { value: "QUALITY", label: "Phẩm chất", field: "qualities" },
  {
    value: "TEACHING_ACTIVITY",
    label: "Hoạt động dạy học",
    field: "teachingActivities",
  },
  { value: "ASSESSMENT", label: "Đánh giá", field: "assessmentEvidence" },
  {
    value: "DIGITAL_COMPETENCY",
    label: "Năng lực số",
    field: "digitalCompetencyIntegration",
  },
  { value: "AI_INTEGRATION", label: "Tích hợp AI", field: "aiIntegration" },
  { value: "SPECIAL_NEEDS", label: "HSKT", field: "specialNeedsSupport" },
  { value: "OTHER", label: "Khác", field: "unmappedContent" },
];
export function correctClassification(
  original: PedagogicalAnalysis,
  id: string,
  category: BlockClassification["category"],
): PedagogicalAnalysis {
  const a = analysisSchema.parse(structuredClone(original));
  const c = a.classifications.find((c) => c.id === id);
  const choice = correctionCategories.find((x) => x.value === category);
  if (!c || c.isHeading || !choice)
    throw new Error("Nội dung hoặc nhóm phân loại không hợp lệ.");
  if (c.corrected)
    throw new Error(
      "Nội dung này đã chuyển nhóm. Thầy/cô có thể sửa ở mục tương ứng.",
    );
  const match = c.field.match(/^(\w+)\[(\d+)\]$/);
  if (!match || match[1] === "teachingActivities")
    throw new Error(
      "Chỉ chuyển nội dung chưa phân loại; nội dung hoạt động được sửa trong mục hoạt động.",
    );
  const oldField = match[1] as keyof PedagogicalAnalysis,
    index = Number(match[2]);
  const values = a[oldField];
  if (!Array.isArray(values)) throw new Error("Không tìm thấy nội dung nguồn.");
  const source = (values as string[])[index];
  if (source === undefined)
    throw new Error("Nội dung đã được sửa/xóa; hãy đối chiếu lại.");
  (values as string[]).splice(index, 1);
  for (const other of a.classifications) {
    const m = other.field.match(/^(\w+)\[(\d+)\]$/);
    if (m?.[1] === oldField && Number(m[2]) > index)
      other.field = `${oldField}[${Number(m[2]) - 1}]`;
  }
  if (choice.field === "teachingActivities") {
    c.field = `teachingActivities[${a.teachingActivities.length}].content[0]`;
    a.teachingActivities.push(
      activitySchema.parse({
        id: crypto.randomUUID(),
        title: "Hoạt động do thầy/cô phân loại",
        stage: null,
        content: [source],
        estimatedMinutes: null,
      }),
    );
  } else {
    const target = a[choice.field as keyof PedagogicalAnalysis] as string[];
    c.field = `${choice.field}[${target.length}]`;
    target.push(source);
  }
  c.category = category;
  c.corrected = true;
  c.needsReview = false;
  c.signals.push(
    "Giáo viên chuyển nhóm; điểm bên trên là điểm quy tắc ban đầu.",
  );
  a.teacherEditedFields = [
    ...new Set([
      ...a.teacherEditedFields,
      oldField,
      choice.field,
      "classifications",
    ]),
  ];
  const originalTrace = a.sourceTraces.find(
    (t) => t.sourceText === c.sourceText,
  );
  if (originalTrace)
    a.sourceTraces.push({ ...originalTrace, field: choice.field });
  return analysisSchema.parse(a);
}
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
  if (
    !a.learningOutcomes.some((x) => x.trim()) &&
    !a.knowledgeObjectives.some((x) => x.trim())
  )
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
  const classifications = a.classifications.map((c) => {
    const m = c.field.match(/^(\w+)\[(\d+)\]$/);
    if (m?.[1] !== field || !Array.isArray(value)) return c;
    const oldValues = a[field];
    if (!Array.isArray(oldValues)) return c;
    const original = oldValues[Number(m[2])];
    const index = value.indexOf(original as never);
    return index >= 0
      ? { ...c, field: `${String(field)}[${index}]` }
      : {
          ...c,
          field: "",
          needsReview: false,
          corrected: true,
          signals: [...c.signals, "Giáo viên đã sửa/xóa ý này ở ô nội dung."],
        };
  });
  return analysisSchema.parse({
    ...a,
    [field]: value,
    classifications,
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
