import { analysisSchema } from "../../src/import/model";
export function periodAnalysis() {
  const source = {
    blockId: "b1",
    sourceText: "TIẾT 1 (35 phút)",
    confidence: 1,
    needsReview: false,
  };
  return analysisSchema.parse({
    version: "1.0",
    id: "a",
    sourceDocumentId: "d",
    subject: "Tin học",
    curriculumGrade: "3",
    targetAudienceGrade: "3",
    lessonTitle: "Làm việc với máy tính",
    topic: "Máy tính",
    curriculum: "",
    durationMinutes: 105,
    periodCount: 3,
    minutesPerPeriod: 35,
    learningOutcomes: ["Thực hiện thao tác nháy chuột"],
    knowledgeObjectives: [],
    competencies: [],
    qualities: [],
    digitalCompetencyIntegration: [],
    aiIntegration: [],
    specialNeedsSupport: [],
    keyKnowledge: [],
    assessmentEvidence: [],
    safetyTopics: [],
    sourceWarnings: [],
    unmappedContent: [],
    sourceTraces: [],
    teacherEditedFields: [],
    teachingPeriods: [1, 2, 3].map((number) => ({
      id: `p${number}`,
      number,
      durationMinutes: 35,
      source: {
        ...source,
        blockId: `b${number}`,
        sourceText: `TIẾT ${number} (35 phút)`,
      },
    })),
    teachingActivities: [1, 2, 3].map((number) => ({
      id: `a${number}`,
      title: `Thực hành ${number}`,
      stage: "PRACTICE",
      periodId: `p${number}`,
      content: ["Nháy chuột vào biểu tượng."],
      studentActivity: ["HS lắng nghe", "Nháy chuột vào biểu tượng."],
      teacherActivity: ["GV nhận xét"],
      estimatedMinutes: 15,
      source: { ...source, blockId: `b${number}` },
    })),
  });
}
import { assessmentSchema } from "../../src/import/assessmentModel";
export function confirmedSourceQuestion() {
  const source = {
    blockId: "b1",
    sourceText: "Em chọn thao tác nào?",
    paragraph: 0,
    role: "STUDENT",
  };
  return assessmentSchema.parse({
    id: "q1",
    type: "MULTIPLE_CHOICE",
    prompt: "Em chọn thao tác nào?",
    choices: [
      { label: "A", text: "Nháy chuột" },
      { label: "B", text: "Rút điện" },
    ],
    answer: { text: "A", value: "A", source, status: "TEACHER_CONFIRMED" },
    answerCandidates: [],
    feedback: "Dùng chuột để chọn biểu tượng.",
    sources: [source],
    periodId: "p1",
    activityId: "a1",
    context: "ACTIVITY",
    confidence: 1,
    reviewStatus: "READY",
    duplicateCount: 0,
    teacherEdited: true,
  });
}
