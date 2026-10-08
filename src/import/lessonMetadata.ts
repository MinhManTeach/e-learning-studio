import type { PedagogicalAnalysis } from "./model";
import { normalizeHeading } from "./analyzer";

type IdentityField =
  | "subject"
  | "curriculumGrade"
  | "lessonTitle"
  | "lessonNumber"
  | "periodCount"
  | "minutesPerPeriod";
export type MetadataFact = { field: IdentityField; value: string | number };

/** Recognize declarations, never a grade inferred from time or arbitrary prose. */
export function detectLessonMetadata(
  text: string,
  allowBareSubject: boolean,
): MetadataFact[] {
  const source = text.trim().replace(/\s+/g, " ");
  if (
    /^(?:môn học|môn|lĩnh vực|tên bài học|tên bài|bài học)\s*[:：]?$/iu.test(
      source,
    )
  )
    return [];
  const facts: MetadataFact[] = [];
  const numbered = source.match(/^bài\s+(\d+)\s*[.:：–—-]\s*(.+)$/iu);
  if (numbered) {
    facts.push({ field: "lessonNumber", value: Number(numbered[1]) });
    // Keep the existing session-title normalization in structure.ts.
    if (
      !/^bài\s+\d+\s*[:：]/iu.test(source) &&
      !/\((?:t|tiết)\s*\d+\)\s*$/iu.test(numbered[2])
    )
      facts.push({
        field: "lessonTitle",
        value: "Bài " + numbered[1] + " — " + numbered[2],
      });
  }
  const labelledSubject = source.match(
    /^(?:môn học|môn|lĩnh vực)\s*(?:[:：]\s*|\s)(.+)$/iu,
  );
  if (labelledSubject)
    facts.push({ field: "subject", value: labelledSubject[1].trim() });
  const labelledTitle = source.match(
    /^(?:tên bài học|tên bài|bài học)\s*(?:[:：]\s*|\s)(.+)$/iu,
  );
  if (labelledTitle)
    facts.push({ field: "lessonTitle", value: labelledTitle[1].trim() });
  // A bounded vocabulary prevents headings such as TIẾT 3 from becoming subjects.
  const subjectGrade =
    allowBareSubject &&
    source.match(
      /^(tin học|toán|tiếng việt|ngữ văn|ngoại ngữ|tiếng anh|khoa học|lịch sử|địa lí|địa lý|công nghệ|đạo đức|giáo dục thể chất|âm nhạc|mĩ thuật|mỹ thuật|tự nhiên và xã hội|hoạt động trải nghiệm)\s+(?:lớp\s+)?(1[0-2]|[1-9])$/iu,
    );
  if (subjectGrade)
    facts.push(
      { field: "subject", value: subjectGrade[1] },
      { field: "curriculumGrade", value: subjectGrade[2] },
    );
  const n = normalizeHeading(source);
  // Period declarations must have a label; an activity mentioning periods is not metadata.
  if (
    /^(?:so tiet|thoi luong|thoi gian|phan bo thoi luong|moi tiet)\b/.test(n)
  ) {
    const count =
      n.match(
        /^(?:so tiet\s*:?\s*|(?:thoi luong|thoi gian|phan bo thoi luong)\s*:?\s*)(\d+)\s*tiet\b/,
      ) ?? n.match(/^so tiet\s*:?\s*(\d+)\s*$/);
    const perPeriod = n.match(
      /moi tiet\s*(?:[:=]\s*)?(\d+(?:[.,]\d+)?)\s*phut\b/,
    );
    if (count && Number(count[1]) > 0)
      facts.push({ field: "periodCount", value: Number(count[1]) });
    if (perPeriod && Number(perPeriod[1].replace(",", ".")) > 0)
      facts.push({
        field: "minutesPerPeriod",
        value: Number(perPeriod[1].replace(",", ".")),
      });
  }
  return facts;
}

/** Keep total lesson time distinct from allocations and from the number of periods. */
export function finalizeLessonDuration(a: PedagogicalAnalysis) {
  a.periodCount ??= null;
  a.minutesPerPeriod ??= null;
  a.lessonNumber ??= null;
  if (
    a.periodCount !== null &&
    a.minutesPerPeriod === null &&
    a.durationMinutes === null
  )
    a.sourceWarnings.push(
      "Đã xác định " +
        a.periodCount +
        " tiết nhưng chưa có số phút mỗi tiết; chưa xác định tổng thời lượng theo phút.",
    );
  const derived =
    a.periodCount !== null && a.minutesPerPeriod !== null
      ? a.periodCount * a.minutesPerPeriod
      : null;
  if (derived !== null) {
    if (a.durationMinutes !== null && a.durationMinutes !== derived)
      a.sourceWarnings.push(
        "Thời lượng tổng ghi rõ " +
          a.durationMinutes +
          " phút xung đột với " +
          a.periodCount +
          " tiết × " +
          a.minutesPerPeriod +
          " phút = " +
          derived +
          " phút; giữ tổng ghi rõ để giáo viên kiểm tra.",
      );
    else a.durationMinutes = derived;
    if (
      !a.sourceTraces.some((t) => t.field === "durationMinutes") &&
      a.durationMinutes === derived
    ) {
      const seen = new Set<string>();
      for (const t of a.sourceTraces.filter(
        (t) => t.field === "periodCount" || t.field === "minutesPerPeriod",
      )) {
        const key = JSON.stringify([t.blockId, t.row, t.column, t.sourceText]);
        if (!seen.has(key))
          a.sourceTraces.push({ ...t, field: "totalDurationMinutes" });
        seen.add(key);
      }
    }
  }
  a.totalDurationMinutes = a.durationMinutes;
  if (
    a.totalDurationMinutes !== null &&
    !a.sourceTraces.some((t) => t.field === "totalDurationMinutes")
  )
    a.sourceTraces.push(
      ...a.sourceTraces
        .filter((t) => t.field === "durationMinutes")
        .map((t) => ({ ...t, field: "totalDurationMinutes" })),
    );
  if (
    derived !== null &&
    !a.sourceTraces.some((t) => t.field === "durationMinutes")
  )
    a.sourceTraces.push(
      ...a.sourceTraces
        .filter((t) => t.field === "totalDurationMinutes")
        .map((t) => ({ ...t, field: "durationMinutes" })),
    );
  for (const activity of a.teachingActivities)
    activity.activityDurationMinutes = activity.estimatedMinutes;
  const allocations = a.teachingActivities.filter(
    (t) => t.estimatedMinutes !== null,
  );
  const sum = allocations.reduce((n, t) => n + t.estimatedMinutes!, 0);
  if (
    a.totalDurationMinutes !== null &&
    allocations.length &&
    sum !== a.totalDurationMinutes
  )
    a.sourceWarnings.push(
      "Phân bổ hoạt động nhận diện được: " +
        sum +
        " phút; tổng bài học: " +
        a.totalDurationMinutes +
        " phút. Có thể thiếu hoạt động hoặc có thời lượng xung đột; không tự điều chỉnh.",
    );
}
