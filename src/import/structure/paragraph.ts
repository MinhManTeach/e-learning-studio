// Classifies one paragraph/list item/cell paragraph of a lesson plan.
import type { LessonDocumentBlock } from "../model";
import { normalizeHeading } from "../analyzer";
import { nonActivityBoundary, periodHeading } from "../activityStructure";
import type { StructureContext } from "./context";
import { startHeading } from "./headings";
import { identity } from "./identity";
import { assign, emit, source } from "./record";

export function paragraph(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  if (!text.trim()) return;
  if (periodTitle(ctx, block, text, row, column)) return;
  if (blankOrNonActivity(ctx, block, text, row, column)) return;
  if (
    startHeading(ctx, block, text, row, column) ||
    identity(ctx, block, text, row, column)
  )
    return;
  if (objectivesLeadIn(ctx, block, text, row, column)) return;
  if (unknownHeading(ctx, block, text, row, column)) return;
  sectionContent(ctx, block, text, row, column);
}

// "Tiết N" starts a new teaching period and resets the heading stack.
function periodTitle(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  const session = periodHeading(text);
  if (session) {
    ctx.active = undefined;
    ctx.stack.length = 0;
    ctx.stack.push({
      category: "TEACHING_ACTIVITY",
      field: "teachingActivities",
      level: 1,
      heading: text,
    });
    ctx.periodId = ctx.doc.id + "-period-" + block.id + "-" + (row ?? 0);
    (ctx.a.teachingPeriods ??= []).push({
      id: ctx.periodId,
      number: session.number,
      durationMinutes: session.durationMinutes,
      source: source(ctx, block, text, row, column, 0.95),
    });
    emit(
      ctx,
      block,
      text,
      "TEACHING_ACTIVITY",
      "teachingPeriods",
      ["Tiêu đề tiết ghi rõ trong nguồn"],
      0.95,
      true,
      row,
      column,
    );
    return true;
  }
  return false;
}

// Filler lines and note/assessment/worksheet boundaries are kept unmapped.
function blankOrNonActivity(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  if (/^[.\s…_–-]+$/.test(text.trim()) || nonActivityBoundary(text)) {
    if (nonActivityBoundary(text)) {
      ctx.active = undefined;
      ctx.stack.length = 0;
      ctx.stack.push({
        category: "OTHER",
        field: "unmappedContent",
        level: 1,
        heading: text,
      });
    }
    assign(
      ctx,
      block,
      text,
      "OTHER",
      "unmappedContent",
      ["Ghi chú/đánh giá/phiếu hoặc dòng trống; không phải hoạt động"],
      0.35,
      row,
      column,
    );
    return true;
  }
  return false;
}

function objectivesLeadIn(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  // A lead-in within objectives preserves the parent section rather than
  // starting an unknown section. This is a structural hint, not semantic AI.
  const parent = ctx.stack.at(-1);
  if (
    parent &&
    ["LEARNING_OUTCOME", "KNOWLEDGE"].includes(parent.category) &&
    /^sau bai(?: hoc)?(?: nay)?,? (?:hs|hoc sinh) se\s*:$/.test(
      normalizeHeading(text),
    )
  ) {
    emit(
      ctx,
      block,
      text,
      parent.category,
      "",
      ["Mở đầu danh sách trong mục tiêu cha"],
      0.9,
      true,
      row,
      column,
    );
    return true;
  }
  return false;
}

// A heading-like line that matched no rule.
function unknownHeading(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  const isBoundary =
    block.type === "HEADING" ||
    /^\s*[IVXLCDM]+[.)]\s*/i.test(text) ||
    /:\s*$/.test(text);
  if (isBoundary) {
    const activityParent = [...ctx.stack]
      .reverse()
      .find((s) => s.field === "teachingActivities");
    const isMajor = /^\s*[IVXLCDM]+[.)]\s*/i.test(text);
    if (
      activityParent &&
      !isMajor &&
      (block.level === undefined || block.level > activityParent.level)
    ) {
      // A named task/subheading inside an activity remains in that activity;
      // it is not an instructional objective just because it contains “học sinh”.
      assign(
        ctx,
        block,
        text,
        "TEACHING_ACTIVITY",
        "activity.content",
        [
          "+0.55 mục hoạt động cha: " + activityParent.heading,
          "+0.20 tiểu mục nằm trong hoạt động",
          "-0.05 tiêu đề con chưa biết tên",
        ],
        0.7,
        row,
        column,
      );
      return true;
    }
    const level = block.level ?? 1;
    while (ctx.stack.length && ctx.stack[ctx.stack.length - 1].level >= level)
      ctx.stack.pop();
    ctx.stack.push({
      category: "OTHER",
      field: "unmappedContent",
      level,
      heading: text,
    });
    ctx.active = undefined;
    emit(
      ctx,
      block,
      text,
      "OTHER",
      "",
      ["+0.30 nhận ra ranh giới tiêu đề, chưa xác định nhóm"],
      0.3,
      true,
      row,
      column,
    );
    assign(
      ctx,
      block,
      text,
      "OTHER",
      "unmappedContent",
      ["+0.30 nhận ra tiêu đề, chưa xác định nhóm"],
      0.3,
      row,
      column,
    );
    return true;
  }
  return false;
}

// Plain text belongs to the nearest open section.
function sectionContent(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  const context = ctx.stack[ctx.stack.length - 1];
  if (context) {
    const signals =
      context.category === "OTHER"
        ? ["+0.30 mục cha chưa phân loại; chưa có căn cứ gán nhóm"]
        : [
            "+0.55 tiêu đề gần nhất: " + context.heading,
            "+0.25 nằm trong ranh giới mục",
          ];
    const lexical =
      context.category !== "OTHER" &&
      /nhận biết|nêu được|thực hiện|hợp tác|trung thực/i.test(text)
        ? 0.05
        : 0;
    if (lexical)
      signals.push(
        "+0.05 cụm từ phù hợp nội dung giáo dục (không tự quyết định nhóm)",
      );
    assign(
      ctx,
      block,
      text,
      context.category,
      context.field === "teachingActivities"
        ? "activity.content"
        : context.field,
      signals,
      context.category === "OTHER" ? 0.3 : 0.8 + lexical,
      row,
      column,
    );
  } else
    assign(
      ctx,
      block,
      text,
      "OTHER",
      "unmappedContent",
      ["0.00 thiếu tiêu đề hoặc cột xác định"],
      0,
      row,
      column,
    );
}
