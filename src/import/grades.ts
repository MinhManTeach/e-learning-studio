import type { PedagogicalAnalysis } from "./model";
export type GradeField = "curriculumGrade" | "targetAudienceGrade";
export function gradeEvidence(a: PedagogicalAnalysis, field: GradeField) {
  const value = /^(?:[1-9]|1[0-2])$/.test(a[field]) ? a[field] : "";
  const stored = a.gradeProvenance?.[field];
  if (stored && stored.value === value && value) return stored;
  if (!value)
    return {
      value: "",
      source: "UNKNOWN" as const,
      sourceText: "",
      confirmed: false,
    };
  const source = a.sourceTraces.find(
    (t) => t.field === field && t.sourceText.includes(value),
  );
  return {
    value,
    source: a.teacherEditedFields.includes(field)
      ? ("TEACHER" as const)
      : source
        ? ("DOCUMENT" as const)
        : ("UNVERIFIED" as const),
    sourceText: source?.sourceText ?? "",
    confirmed: false,
  };
}
export function confirmedGrades(a: PedagogicalAnalysis) {
  const confirm = (field: GradeField) => {
    const evidence = gradeEvidence(a, field);
    return { ...evidence, confirmed: !!evidence.value };
  };
  return {
    curriculumGrade: confirm("curriculumGrade"),
    targetAudienceGrade: confirm("targetAudienceGrade"),
  };
}
export function canPlanForGrade(a: PedagogicalAnalysis) {
  // Use only the explicit, reviewed values the existing planner accepts.
  const evidence = gradeEvidence(
    a,
    a.targetAudienceGrade ? "targetAudienceGrade" : "curriculumGrade",
  );
  return !!evidence.value && evidence.confirmed;
}
