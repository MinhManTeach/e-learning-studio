// Recognizes section/activity headings and opens them on the heading stack.
import { activitySchema, type LessonDocumentBlock } from "../model";
import { parseDuration } from "../analyzer";
import type { StructureContext } from "./context";
import { assign, emit, source } from "./record";
import { cleaned, heading, stageMap } from "./rules";

export function startHeading(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row?: number,
  column?: number,
) {
  const h = heading(text);
  if (!h) return false;
  const numbered = /^\s*([IVXLCDM]+|\d+(?:\.\d+)*|[A-Z])[.)]/i.exec(text);
  const level =
    block.level ??
    (numbered
      ? /^[a-z]\)/.test(text.trim())
        ? 3
        : /^[IVXLCDM]+$/i.test(numbered[1])
          ? 1
          : 2
      : h.field === "teachingActivities"
        ? 2
        : 3);
  while (ctx.stack.length && ctx.stack[ctx.stack.length - 1].level >= level)
    ctx.stack.pop();
  if (
    h.category === "PREPARATION" ||
    h.category === "TEACHING_ACTIVITY" ||
    h.category === "LEARNING_OUTCOME"
  ) {
    ctx.stack.length = 0;
    ctx.active = undefined;
  }
  if (h.field !== "teachingActivities") ctx.active = undefined;
  ctx.stack.push({
    category: h.category,
    field: h.field,
    level,
    heading: h.label,
  });
  emit(
    ctx,
    block,
    text,
    h.category,
    "",
    ["+0.55 tiêu đề khớp nhóm", "+0.25 ranh giới mục xác định"],
    0.8,
    true,
    row,
    column,
  );
  if (h.field === "teachingActivities" && h.category !== "TEACHING_ACTIVITY") {
    ctx.active = activitySchema.parse({
      id: `${ctx.doc.id}-activity-${block.id}-${row ?? 0}`,
      title: cleaned(text),
      stage: stageMap[h.category] ?? null,
      source: source(
        ctx,
        block,
        text,
        row,
        column,
        parseDuration(text) === null ? 0.7 : 0.85,
        parseDuration(text) === null,
      ),
      periodId: ctx.periodId,
      content: [],
      estimatedMinutes: parseDuration(text),
    });
    ctx.a.teachingActivities.push(ctx.active);
  }
  if (h.value)
    assign(
      ctx,
      block,
      h.category === "AI_INTEGRATION" ? cleaned(text) : h.value,
      h.category,
      h.field === "teachingActivities" ? "activity.content" : h.field,
      ["+0.55 nhãn mục", "+0.25 nội dung cùng nhãn"],
      h.category === "AI_INTEGRATION" ? 0.95 : 0.8,
      row,
      column,
    );
  return true;
}
