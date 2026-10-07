import {
  analysisSchema,
  importedDocumentSchema,
  type ImportedLessonDocument,
  type LessonAnalysisProvider,
  type PedagogicalAnalysis,
  type AnalysisProgress,
  type TeachingActivity,
} from "./model";

export const analysisSteps = [
  "Xác định thông tin bài học",
  "Phân tích yêu cầu cần đạt",
  "Phân tích kiến thức trọng tâm",
  "Phân tích năng lực và phẩm chất",
  "Phân tích hoạt động học tập",
  "Kiểm tra nội dung đánh giá",
  "Kiểm tra tích hợp năng lực số / AI",
] as const;
export function normalizeHeading(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
type ListField =
  | "learningOutcomes"
  | "knowledgeObjectives"
  | "competencies"
  | "qualities"
  | "digitalCompetencyIntegration"
  | "aiIntegration"
  | "specialNeedsSupport"
  | "keyKnowledge"
  | "assessmentEvidence"
  | "safetyTopics"
  | "unmappedContent";
type MetaField =
  | "subject"
  | "curriculumGrade"
  | "targetAudienceGrade"
  | "lessonTitle"
  | "topic"
  | "durationMinutes"
  | "curriculum";
type Section = ListField | "activities";
const metadataAliases: [string, MetaField][] = [
  ["doi tuong hoc sinh", "targetAudienceGrade"],
  ["lop doi tuong", "targetAudienceGrade"],
  ["lop hoc sinh", "targetAudienceGrade"],
  ["doi tuong", "targetAudienceGrade"],
  ["lop chuong trinh", "curriculumGrade"],
  ["khoi lop", "curriculumGrade"],
  ["mon hoc", "subject"],
  ["linh vuc", "subject"],
  ["mon", "subject"],
  ["ten bai hoc", "lessonTitle"],
  ["ten bai", "lessonTitle"],
  ["bai hoc", "lessonTitle"],
  ["bai", "lessonTitle"],
  ["chu de", "topic"],
  ["thoi luong du kien", "durationMinutes"],
  ["thoi luong", "durationMinutes"],
  ["thoi gian", "durationMinutes"],
  ["so tiet", "durationMinutes"],
  ["chuong trinh", "curriculum"],
  ["khoi", "curriculumGrade"],
  ["lop", "curriculumGrade"],
];
const sectionAliases: [string, Section][] = [
  ["yeu cau can dat", "learningOutcomes"],
  ["muc tieu bai hoc", "learningOutcomes"],
  ["muc tieu", "learningOutcomes"],
  ["ve kien thuc", "knowledgeObjectives"],
  ["kien thuc", "knowledgeObjectives"],
  ["nang luc chung", "competencies"],
  ["nang luc dac thu", "competencies"],
  ["ve nang luc", "competencies"],
  ["nang luc", "competencies"],
  ["ve pham chat", "qualities"],
  ["pham chat", "qualities"],
  ["cac hoat dong day hoc chu yeu", "activities"],
  ["cac hoat dong day hoc", "activities"],
  ["hoat dong day hoc", "activities"],
  ["tien trinh day hoc", "activities"],
  ["activities", "activities"],
  ["tich hop nang luc so", "digitalCompetencyIntegration"],
  ["nang luc so", "digitalCompetencyIntegration"],
  ["tich hop giao duc ai", "aiIntegration"],
  ["tich hop ai", "aiIntegration"],
  ["tri tue nhan tao", "aiIntegration"],
  ["ho tro hoc sinh dac thu", "specialNeedsSupport"],
  ["ho tro hoc sinh khuyet tat", "specialNeedsSupport"],
  ["hoc sinh khuyet tat", "specialNeedsSupport"],
  ["hskt", "specialNeedsSupport"],
  ["noi dung trong tam", "keyKnowledge"],
  ["kien thuc trong tam", "keyKnowledge"],
  ["noi dung cot loi", "keyKnowledge"],
  ["minh chung danh gia", "assessmentEvidence"],
  ["kiem tra danh gia", "assessmentEvidence"],
  ["danh gia", "assessmentEvidence"],
  ["an toan", "safetyTopics"],
  ["chu de an toan", "safetyTopics"],
  ["thiet bi day hoc va hoc lieu", "unmappedContent"],
  ["thiet bi va hoc lieu", "unmappedContent"],
  ["thiet bi day hoc", "unmappedContent"],
  ["thiet bi", "unmappedContent"],
  ["hoc lieu", "unmappedContent"],
  ["chuan bi", "unmappedContent"],
  ["dieu chinh sau bai day", "unmappedContent"],
].sort((a, b) => b[0].length - a[0].length) as [string, Section][];
const stageAliases: [string, NonNullable<TeachingActivity["stage"]>][] = [
  ["khoi dong", "OPENING"],
  ["mo dau", "OPENING"],
  ["kham pha", "DISCOVERY"],
  ["hinh thanh kien thuc", "DISCOVERY"],
  ["thuc hanh", "PRACTICE"],
  ["luyen tap", "ASSESSMENT"],
  ["van dung", "APPLICATION"],
];
function stripNumber(value: string) {
  return value
    .trim()
    .replace(/^(?:[ivxlcdm]+|\d+(?:\.\d+)*|[a-z])[.):\-]\s+/i, "")
    .replace(/^[ivx]+\s+/i, "")
    .replace(/^[-•*–]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}
function matchAlias<F extends string>(
  line: string,
  aliases: [string, F][],
  allowInline: boolean,
) {
  const normalized = normalizeHeading(line);
  for (const [alias, field] of aliases) {
    if (
      normalized === alias ||
      normalized.startsWith(alias + ":") ||
      normalized.startsWith(alias + " — ") ||
      normalized.startsWith(alias + " - ") ||
      (allowInline && normalized.startsWith(alias + " "))
    ) {
      return {
        field,
        value: line
          .slice(alias.length)
          .replace(/^\s*[:—–-]\s*/, "")
          .trim(),
      };
    }
  }
  return null;
}
export function parseDuration(value: string): number | null {
  const v = normalizeHeading(value);
  if (/(?:^|\s)[-−]\s*\d/.test(v)) return null;
  // A period is not silently assumed to be 35/45 minutes.
  if (/tiet/.test(v) && !/phut|gio|\bmin\b/.test(v)) return null;
  if (/\d\s*[-–]\s*\d/.test(v)) return null;
  const hours = v.match(/(\d+(?:[.,]\d+)?)\s*gio/);
  const minutes = v.match(/(\d+(?:[.,]\d+)?)\s*(?:phut|min\b)/);
  if (hours || minutes)
    return (
      (hours ? Number(hours[1].replace(",", ".")) * 60 : 0) +
      (minutes ? Number(minutes[1].replace(",", ".")) : 0)
    );
  return /^\d+(?:[.,]\d+)?$/.test(v) ? Number(v.replace(",", ".")) : null;
}
export function parseGrade(value: string) {
  const m = normalizeHeading(value).match(
    /^(?:lop\s*|khoi\s*)?(1[0-2]|[1-9])(?:\s|$|[.,;])/,
  );
  return m ? m[1] : "";
}
type Event = {
  field: MetaField | Section;
  value: string;
  source: string;
  line: number;
  lineEnd?: number;
  bullet: boolean;
  heading: boolean;
  activity?: TeachingActivity;
};
function scan(document: ImportedLessonDocument): Event[] {
  const events: Event[] = [];
  let section: Section = "unmappedContent";
  let activeActivity: TeachingActivity | undefined;
  let pendingMeta: MetaField | undefined;
  let pendingSource: { source: string; line: number } | undefined;
  document.rawText
    .normalize("NFC")
    .split("\n")
    .forEach((source, index) => {
      const original = source.trim();
      if (!original) return;
      const line = stripNumber(original),
        lineNumber = index + 1;
      const base = {
        source,
        line: lineNumber,
        bullet: /^\s*(?:[-•*–]|\d+[.)]\s)/.test(source),
        heading: false,
      };
      let activityLine = line.replace(/^hoạt động\s*\d*\s*[:.\-–]?\s*/i, "");
      const withoutTime = activityLine
        .replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/:\s*$/, "");
      const stage = matchAlias(withoutTime, stageAliases, false);
      if (stage) {
        activeActivity = {
          id: `${document.id}-activity-${lineNumber}`,
          title: activityLine,
          stage: stage.field,
          content: [],
          estimatedMinutes: parseDuration(activityLine),
        };
        events.push({
          ...base,
          field: "activities",
          value: activityLine,
          heading: true,
          activity: activeActivity,
        });
        section = "activities";
        pendingMeta = undefined;
        return;
      }
      // Match stages first: accent normalization makes “Khối” and “Khởi” share a prefix.
      const meta = matchAlias(line, metadataAliases, true);
      if (meta) {
        activeActivity = undefined;
        if (!meta.value) {
          pendingMeta = meta.field;
          pendingSource = { source, line: lineNumber };
        } else {
          events.push({ ...base, ...meta });
          pendingMeta = undefined;
        }
        section = "unmappedContent";
        return;
      }
      const heading = matchAlias(line, sectionAliases, false);
      if (heading) {
        section = heading.field;
        activeActivity = undefined;
        pendingMeta = undefined;
        if (heading.value)
          events.push({
            ...base,
            field: section,
            value: heading.value,
            heading: true,
          });
        else if (section === "unmappedContent")
          events.push({
            ...base,
            field: section,
            value: original,
            heading: true,
          });
        return;
      }
      if (pendingMeta) {
        events.push({
          ...base,
          field: pendingMeta,
          value: line,
          source: pendingSource ? pendingSource.source + "\n" + source : source,
          line: pendingSource?.line ?? lineNumber,
          lineEnd: lineNumber,
        });
        pendingMeta = undefined;
        return;
      }
      if (/:\s*$/.test(line) || /^[IVXLCDM]+[.)]\s+/i.test(original)) {
        section = "unmappedContent";
        activeActivity = undefined;
      }
      if (section === "activities" && !activeActivity) {
        activeActivity = {
          id: `${document.id}-activity-${lineNumber}`,
          title: line,
          stage: null,
          content: [],
          estimatedMinutes: null,
        };
        events.push({
          ...base,
          field: "activities",
          value: line,
          activity: activeActivity,
          heading: true,
        });
      } else
        events.push({
          ...base,
          field: section,
          value: line,
          activity: section === "activities" ? activeActivity : undefined,
        });
    });
  return events;
}
function emptyAnalysis(document: ImportedLessonDocument): PedagogicalAnalysis {
  return {
    version: "1.0",
    id: `analysis-${document.id}`,
    sourceDocumentId: document.id,
    subject: "",
    curriculumGrade: "",
    targetAudienceGrade: "",
    lessonTitle: "",
    topic: "",
    durationMinutes: null,
    curriculum: "",
    learningOutcomes: [],
    knowledgeObjectives: [],
    competencies: [],
    qualities: [],
    digitalCompetencyIntegration: [],
    aiIntegration: [],
    specialNeedsSupport: [],
    teachingActivities: [],
    keyKnowledge: [],
    assessmentEvidence: [],
    safetyTopics: [],
    sourceWarnings: [],
    unmappedContent: [],
    sourceTraces: [],
    teacherEditedFields: [],
  };
}
function trace(a: PedagogicalAnalysis, e: Event, confidence = 0.9) {
  a.sourceTraces.push({
    field: e.field,
    sourceText: e.source,
    lineStart: e.line,
    lineEnd: e.lineEnd ?? e.line,
    confidence,
  });
}
function collect(a: PedagogicalAnalysis, events: Event[], fields: ListField[]) {
  let previous: Event | undefined;
  for (const e of events) {
    if (!fields.includes(e.field as ListField)) {
      previous = undefined;
      continue;
    }
    const field = e.field as ListField;
    // Wraps in a bullet item remain one statement; normal separate lines remain separate.
    if (
      previous?.field === field &&
      !e.bullet &&
      !e.heading &&
      e.line === previous.line + 1 &&
      (previous.bullet ||
        /^\s/.test(e.source) ||
        !/[.!?;:]$/.test(previous.value))
    ) {
      a[field][a[field].length - 1] += " " + e.value;
    } else a[field].push(e.value);
    trace(a, e, field === "unmappedContent" ? 0.45 : 0.9);
    previous = e;
  }
}
function metadata(a: PedagogicalAnalysis, events: Event[]) {
  const fields = new Set(metadataAliases.map((x) => x[1]));
  for (const e of events) {
    if (!fields.has(e.field as MetaField)) continue;
    const field = e.field as MetaField;
    const value =
      field === "durationMinutes"
        ? parseDuration(
            normalizeHeading(e.source).includes("so tiet") &&
              !/phut|gio|min\b/.test(normalizeHeading(e.value))
              ? e.value + " tiết"
              : e.value,
          )
        : field === "curriculumGrade" || field === "targetAudienceGrade"
          ? parseGrade(e.value)
          : e.value;
    if (value === null || value === "") {
      a.unmappedContent.push(e.source);
      a.sourceWarnings.push(
        `Chưa xác định được ${field === "durationMinutes" ? "thời lượng theo phút" : "lớp học"} từ “${e.source}”. Thầy/cô hãy bổ sung.`,
      );
      trace(a, e, 0.4);
      continue;
    }
    if (a[field] !== null && a[field] !== "" && a[field] !== value) {
      a.sourceWarnings.push(
        `Có nhiều thông tin khác nhau cho “${e.source}”. Đã giữ giá trị phát hiện đầu tiên; thầy/cô hãy kiểm tra.`,
      );
      a.unmappedContent.push(e.source);
      trace(a, e, 0.5);
      continue;
    }
    if (field === "durationMinutes") a.durationMinutes = value as number;
    else a[field] = value as string;
    trace(a, e, 0.98);
  }
}
function activities(a: PedagogicalAnalysis, events: Event[]) {
  for (const e of events.filter((e) => e.field === "activities")) {
    if (e.activity) {
      let activity = a.teachingActivities.find((x) => x.id === e.activity!.id);
      if (!activity) {
        activity = { ...e.activity, content: [] };
        a.teachingActivities.push(activity);
      }
      if (!e.heading) activity.content.push(e.value);
      trace(a, e);
    } else {
      a.unmappedContent.push(e.source);
      trace(a, { ...e, field: "unmappedContent" }, 0.45);
    }
  }
}
export class DeterministicLessonAnalysisProvider implements LessonAnalysisProvider {
  readonly kind = "LOCAL" as const;
  async analyze(
    document: ImportedLessonDocument,
    onProgress?: (p: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<PedagogicalAnalysis> {
    importedDocumentSchema.parse(document);
    const analysis = emptyAnalysis(document);
    let events: Event[] = [];
    const pipeline = [
      () => {
        events = scan(document);
        metadata(analysis, events);
      },
      () => collect(analysis, events, ["learningOutcomes"]),
      () =>
        collect(analysis, events, [
          "knowledgeObjectives",
          "keyKnowledge",
          "unmappedContent",
        ]),
      () => collect(analysis, events, ["competencies", "qualities"]),
      () => activities(analysis, events),
      () => collect(analysis, events, ["assessmentEvidence", "safetyTopics"]),
      () =>
        collect(analysis, events, [
          "digitalCompetencyIntegration",
          "aiIntegration",
          "specialNeedsSupport",
        ]),
    ];
    for (let i = 0; i < pipeline.length; i++) {
      signal?.throwIfAborted();
      onProgress?.({ index: i, label: analysisSteps[i], completed: false });
      // Yield between real local stages so React can report completed work; no simulated network delay.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      pipeline[i]();
      onProgress?.({ index: i, label: analysisSteps[i], completed: true });
    }
    return analysisSchema.parse(analysis);
  }
}
