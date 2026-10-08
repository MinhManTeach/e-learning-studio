import { normalizeHeading, parseDuration } from "./analyzer";
import type { BlockClassification, PedagogicalAnalysis } from "./model";

export function activityHeading(
  text: string,
): BlockClassification["category"] | null {
  const n = normalizeHeading(text)
    .replace(/^(?:[ivxlcdm]+|\d+(?:\.\d+)*|[a-z])[.):–—-]+\s*/i, "")
    .replace(/^hoat dong\s*\d*\s*[:.–—-]*\s*/, "")
    .replace(/\s*[([][^)\]]*[)\]]?\s*$/, "")
    .replace(/[.。]+$/, "")
    .trim();
  if (/^(?:khoi dong|mo dau)$/.test(n)) return "WARMUP";
  if (
    /^(?:kham pha(?: kien thuc)?(?: tiep)?|hinh thanh kien thuc)(?:\s+\d+)?(?:\s*[:–—-].*)?$/.test(
      n,
    )
  )
    return "DISCOVERY";
  if (/^(?:thuc hanh|luyen tap)$/.test(n)) return "PRACTICE";
  if (/^(?:van dung|cung co(?:\s*[,/–—-]\s*dan do)?|dan do|tong ket)$/.test(n))
    return "APPLICATION";
  return null;
}
export function periodHeading(text: string) {
  const match = text
    .trim()
    .match(/^(?:tiết|tiết học)\s+(\d+)(?:\s*[(\[]([^\])]+)[)\]]?)?\s*[:.]?$/iu);
  return match && Number(match[1]) > 0
    ? {
        number: Number(match[1]),
        durationMinutes:
          match[2] && /phút|giờ|min\b|[’′']/iu.test(match[2])
            ? parseDuration(match[2])
            : null,
      }
    : null;
}
export function nonActivityBoundary(text: string) {
  const n = normalizeHeading(text).replace(/^(?:[ivxlcdm]+|\d+)[.)]+\s*/i, "");
  return /^(?:ghi chu(?: cua giao vien)?|luu y(?: cua giao vien)?|dieu chinh|goi y dieu chinh|danh gia sau|phieu hoc tap|phieu (?:so|thuc hanh)|ghi nho cuoi bai)(?:\s|:|$)/.test(
    n,
  );
}
export function finalizeActivityStructure(a: PedagogicalAnalysis) {
  const periods = a.teachingPeriods ?? [];
  for (const period of periods) {
    if (period.durationMinutes === null && a.minutesPerPeriod) {
      period.durationMinutes = a.minutesPerPeriod;
      period.durationSource = a.sourceTraces
        .filter((t) => t.field === "minutesPerPeriod" && t.blockId)
        .map((t) => ({
          blockId: t.blockId!,
          sourceText: t.sourceText,
          tableIndex: t.tableIndex,
          row: t.row,
          column: t.column,
          confidence: t.confidence,
          needsReview: false,
        }));
    } else if (period.durationMinutes !== null)
      period.durationSource = [period.source];
    const activities = a.teachingActivities.filter(
      (t) => t.periodId === period.id,
    );
    const known = activities.filter((t) => t.estimatedMinutes !== null);
    const sum = known.reduce((n, t) => n + t.estimatedMinutes!, 0);
    if (
      period.durationMinutes !== null &&
      (known.length !== activities.length || sum !== period.durationMinutes)
    )
      a.sourceWarnings.push(
        "Tiết " +
          period.number +
          ": phân bổ hoạt động nhận diện " +
          sum +
          " phút so với " +
          period.durationMinutes +
          " phút; cần kiểm tra phần thiếu hoặc xung đột.",
      );
  }
  if (
    a.periodCount &&
    periods.length &&
    a.periodCount !== new Set(periods.map((p) => p.number)).size
  )
    a.sourceWarnings.push(
      "Nguồn khai báo " +
        a.periodCount +
        " tiết nhưng nhận diện " +
        new Set(periods.map((p) => p.number)).size +
        " nhóm tiết; không thay đổi số tiết đã khai báo.",
    );
  for (const activity of a.teachingActivities) {
    const children = activity.subactivities ?? [];
    if (!children.length) continue;
    const known = children.filter((c) => c.estimatedMinutes !== null);
    const sum = known.reduce((n, c) => n + c.estimatedMinutes!, 0);
    if (
      activity.estimatedMinutes === null ||
      known.length !== children.length ||
      sum !== activity.estimatedMinutes
    )
      a.sourceWarnings.push(
        "Hoạt động “" +
          activity.title +
          "”: thời lượng tiểu hoạt động nhận diện " +
          sum +
          " phút; thời lượng cha " +
          (activity.estimatedMinutes ?? "chưa rõ") +
          " phút. Giữ riêng các cấp, không cộng đúp.",
      );
  }
}
