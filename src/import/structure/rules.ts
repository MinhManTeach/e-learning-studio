// Heading and label rules for structured lesson-plan classification.
import type {
  BlockClassification,
  PedagogicalAnalysis,
  TeachingActivity,
} from "../model";
import { normalizeHeading } from "../analyzer";
import { activityHeading } from "../activityStructure";

export type Category = BlockClassification["category"];
export type Section = {
  category: Category;
  field: string;
  level: number;
  heading: string;
};
const rules: [RegExp, Category, string][] = [
  [
    /^(?:yeu cau can dat|muc tieu(?: bai hoc)?)$/,
    "LEARNING_OUTCOME",
    "learningOutcomes",
  ],
  [
    /^(?:ve )?kien thuc(?:,? (?:va )?(?:ki|ky) nang)?$/,
    "KNOWLEDGE",
    "knowledgeObjectives",
  ],
  [
    /^(?:noi dung (?:bai hoc|trong tam|cot loi)|kien thuc trong tam)$/,
    "KNOWLEDGE",
    "keyKnowledge",
  ],
  [/^(?:ve )?nang luc ai$/, "AI_INTEGRATION", "aiIntegration"],
  [
    /^(?:ve )?nang luc(?: (?!so(?: |$)|ai(?: |$))[a-z]+(?: [a-z]+){0,3})?$/,
    "COMPETENCY",
    "competencies",
  ],
  [/^(?:ve )?pham chat$/, "QUALITY", "qualities"],
  [
    /^(?:phuong tien day hoc|do dung day hoc|thiet bi(?: day hoc)?(?: va hoc lieu)?|hoc lieu|chuan bi)$/,
    "PREPARATION",
    "unmappedContent",
  ],
  [
    /^(?:cac )?(?:hoat dong day\s*[–—-]?\s*hoc(?: chu yeu)?|tien trinh day hoc|activities)$/,
    "TEACHING_ACTIVITY",
    "teachingActivities",
  ],
  [/^(?:khoi dong|mo dau)$/, "WARMUP", "teachingActivities"],
  [
    /^(?:kham pha(?: tiep)?|hinh thanh kien thuc)$/,
    "DISCOVERY",
    "teachingActivities",
  ],
  [/^(?:thuc hanh|luyen tap)$/, "PRACTICE", "teachingActivities"],
  [
    /^(?:van dung|cung co(?:[, –-]+dan do)?|tong ket)$/,
    "APPLICATION",
    "teachingActivities",
  ],
  [
    /^(?:danh gia|kiem tra danh gia|minh chung danh gia)$/,
    "ASSESSMENT",
    "assessmentEvidence",
  ],
  [
    /^(?:tich hop )?nang luc so$/,
    "DIGITAL_COMPETENCY",
    "digitalCompetencyIntegration",
  ],
  [
    /^(?:tich hop(?: giao duc)? ai|tri tue nhan tao)$/,
    "AI_INTEGRATION",
    "aiIntegration",
  ],
  [
    /^(?:hskt|hoc sinh khuyet tat|ho tro hoc sinh(?: dac thu| khuyet tat)?)$/,
    "SPECIAL_NEEDS",
    "specialNeedsSupport",
  ],
];
export function cleaned(text: string) {
  return text
    .trim()
    .replace(/^\[([^\]]+)\]$/, "$1")
    .replace(/^(?:[IVXLCDM]+|\d+(?:\.\d+)*|[A-Za-z])[.):\-]+\s*/i, "")
    .replace(/^[-•*–]\s*/, "")
    .trim();
}
export function heading(text: string) {
  const activity = activityHeading(text);
  if (activity)
    return {
      category: activity,
      field: "teachingActivities",
      value: "",
      label: text,
    };
  const clean = cleaned(text);
  const colon = clean.indexOf(":");
  const label = (colon >= 0 ? clean.slice(0, colon) : clean)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[.。]\s*$/, "")
    .trim();
  const normalized = normalizeHeading(
    label.replace(/^hoạt động\s*\d*\s*[:.\-–]?\s*/i, ""),
  );
  const rule =
    rules.find(([re]) => re.test(normalizeHeading(label))) ??
    rules.find(([re]) => re.test(normalized));
  return rule
    ? {
        category: rule[1],
        field: rule[2],
        value: colon >= 0 ? clean.slice(colon + 1).trim() : "",
        label,
      }
    : null;
}
export const stageMap: Partial<Record<Category, TeachingActivity["stage"]>> = {
  WARMUP: "OPENING",
  DISCOVERY: "DISCOVERY",
  PRACTICE: "PRACTICE",
  APPLICATION: "APPLICATION",
};
export const metaRules: [RegExp, keyof PedagogicalAnalysis][] = [
  [/^(?:môn học|môn|lĩnh vực)\s*[:：]\s*(.+)$/iu, "subject"],
  [
    /^(?:lớp chương trình|khối lớp|lớp|khối)\s*[:：]?\s*(\d{1,2})(?:\s.*)?$/iu,
    "curriculumGrade",
  ],
  [
    /^(?:đối tượng học sinh|lớp học sinh|lớp đối tượng|đối tượng)\s*[:：]?\s*(.+)$/iu,
    "targetAudienceGrade",
  ],
  [
    /^(?:tên bài học|tên bài|bài học|bài(?:\s+\d+)?)\s*[:：]\s*(.+)$/iu,
    "lessonTitle",
  ],
  [/^chủ đề(?:\s+[^:：]+)?\s*[:：]\s*(.+)$/iu, "topic"],
  [
    /^\(?(?:thời lượng|thời gian|số tiết)\s*(?:[:：]\s*|\s)(.+?)\)?$/iu,
    "durationMinutes",
  ],
  [/^chương trình\s*[:：]\s*(.+)$/iu, "curriculum"],
];
