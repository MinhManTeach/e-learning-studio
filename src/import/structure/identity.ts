// Detects lesson identity metadata (subject, grade, title, duration...).
import type { LessonDocumentBlock } from "../model";
import { parseDuration, parseGrade } from "../analyzer";
import { detectLessonMetadata } from "../lessonMetadata";
import type { StructureContext } from "./context";
import { assign, emit } from "./record";
import { cleaned, metaRules } from "./rules";

export function identity(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  const facts = detectLessonMetadata(
    text,
    ctx.stack.length === 0 && !ctx.active,
  );
  for (const fact of facts) {
    const previous = ctx.a[fact.field];
    if (
      previous !== undefined &&
      previous !== null &&
      previous !== "" &&
      previous !== fact.value
    ) {
      ctx.a.sourceWarnings.push(
        "Thông tin xung đột: " + text + ". Giữ giá trị đầu tiên.",
      );
      assign(
        ctx,
        block,
        text,
        "OTHER",
        "unmappedContent",
        ["Xung đột metadata"],
        0.4,
        row,
        column,
      );
      continue;
    }
    (ctx.a as unknown as Record<string, unknown>)[fact.field] = fact.value;
    emit(
      ctx,
      block,
      text,
      "LESSON_IDENTITY",
      fact.field,
      ["Khai báo rõ trong nguồn"],
      0.9,
      false,
      row,
      column,
    );
  }
  if (
    facts.length &&
    !(facts.length === 1 && facts[0].field === "lessonNumber")
  )
    return true;
  for (const [re, key] of metaRules) {
    const match = cleaned(text).match(re);
    if (!match) continue;
    let value =
      key === "durationMinutes"
        ? parseDuration(
            /số tiết/i.test(text) && !/phút|giờ/i.test(match[1])
              ? match[1] + " tiết"
              : match[1],
          )
        : key === "curriculumGrade" || key === "targetAudienceGrade"
          ? parseGrade(match[1])
          : match[1].trim();
    const numberedSession = text.match(
      /^\s*bài\s+(\d+)\s*[:：]\s*(.*?)\s*\((?:t|tiết)\s*(\d+)\)\s*$/iu,
    );
    if (key === "lessonTitle" && numberedSession)
      value = `Bài ${numberedSession[1]} — ${numberedSession[2]} (Tiết ${numberedSession[3]})`;
    if (value === null || value === "") {
      ctx.a.sourceWarnings.push(
        `Chưa xác định ${key === "durationMinutes" ? "thời lượng theo phút" : "lớp"} từ “${text}”.`,
      );
      assign(
        ctx,
        block,
        text,
        "OTHER",
        "unmappedContent",
        ["+0.55 nhãn thông tin", "-0.15 giá trị thiếu hoặc chưa rõ đơn vị"],
        0.4,
        row,
        column,
      );
      return true;
    }
    if (ctx.a[key] !== "" && ctx.a[key] !== null && ctx.a[key] !== value) {
      ctx.a.sourceWarnings.push(
        `Thông tin xung đột: ${text}. Giữ giá trị đầu tiên.`,
      );
      assign(
        ctx,
        block,
        text,
        "OTHER",
        "unmappedContent",
        ["+0.55 nhãn thông tin", "-0.15 xung đột thông tin đã có"],
        0.4,
        row,
        column,
      );
      return true;
    }
    (ctx.a as unknown as Record<string, unknown>)[key] = value;
    emit(
      ctx,
      block,
      text,
      "LESSON_IDENTITY",
      key,
      ["+0.55 nhãn thông tin", "+0.30 giá trị đúng dạng"],
      0.85,
      false,
      row,
      column,
    );
    return true;
  }
  // Explicit identity inside a document title, not a default subject or grade.
  const identityTitle = text
    .replace(/^GIÁO ÁN\s+TUẦN\s+\d+\s*[–—-]\s*/iu, "GIÁO ÁN ")
    .replace(/\s*\(.*\)\s*$/u, "");
  const title = identityTitle.match(
    /^GIÁO ÁN\s+(?!TUẦN\b)(.+?)\s+(?:LỚP\s+)?(1[0-2]|[1-9])(?:\s*[–—-].*)?$/iu,
  );
  if (title) {
    if (!ctx.a.subject) ctx.a.subject = title[1];
    if (!ctx.a.curriculumGrade) ctx.a.curriculumGrade = title[2];
    emit(
      ctx,
      block,
      text,
      "LESSON_IDENTITY",
      "subject",
      ["+0.55 tiêu đề giáo án", "+0.30 môn/lớp ghi rõ"],
      0.85,
    );
    emit(
      ctx,
      block,
      text,
      "LESSON_IDENTITY",
      "curriculumGrade",
      ["+0.55 tiêu đề giáo án", "+0.30 lớp ghi rõ"],
      0.85,
    );
    return true;
  }
  return false;
}
