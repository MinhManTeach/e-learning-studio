// Records classifications, source traces and field values for one pass.
import type {
  BlockClassification,
  LessonDocumentBlock,
  PedagogicalAnalysis,
} from "../model";
import { normalizeHeading, parseDuration } from "../analyzer";
import type { Category } from "./rules";
import type { StructureContext } from "./context";

export const source = (
  ctx: StructureContext,
  block: LessonDocumentBlock,
  sourceText: string,
  row?: number,
  column?: number,
  confidence = 0.85,
  needsReview = false,
) => ({
  blockId: block.id,
  sourceText,
  tableIndex: ctx.tableIndices.get(block.id),
  row,
  column,
  confidence,
  needsReview,
});

export function emit(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  sourceText: string,
  category: Category,
  field: string,
  signals: string[],
  confidence: number,
  isHeading = false,
  row?: number,
  column?: number,
  needsReview = false,
) {
  const c: BlockClassification = {
    id: `${block.id}-${ctx.seq++}`,
    blockId: block.id,
    sourceText,
    category,
    field,
    signals,
    confidence,
    isHeading,
    row,
    column,
    needsReview,
    corrected: false,
    tableIndex: ctx.tableIndices.get(block.id),
    periodId: ctx.periodId,
  };
  if (
    !isHeading &&
    [
      "LEARNING_OUTCOME",
      "KNOWLEDGE",
      "COMPETENCY",
      "QUALITY",
      "DIGITAL_COMPETENCY",
      "AI_INTEGRATION",
    ].includes(category)
  ) {
    c.isRequiredOutcome =
      category === "LEARNING_OUTCOME" ||
      ctx.stack.some((s) => s.category === "LEARNING_OUTCOME");
    if (category === "COMPETENCY") {
      const label = normalizeHeading(ctx.stack.at(-1)?.heading ?? "");
      c.competencyKind = /nang luc chung$/.test(label)
        ? "GENERAL"
        : /nang luc (?:dac thu|.+)$/.test(label)
          ? "SUBJECT_SPECIFIC"
          : "UNSPECIFIED";
    }
  }
  ctx.a.classifications.push(c);
  let sourceLine = ctx.line;
  if (row !== undefined && block.table) {
    for (const previousRow of block.table.rows.slice(0, row))
      sourceLine += previousRow.cells
        .map((c) => c.text)
        .join("\t")
        .split("\n").length;
    const cells = block.table.rows[row]?.cells ?? [];
    const current = cells.find(
      (c) => (c.column ?? cells.indexOf(c)) === column,
    );
    for (const cell of cells) {
      if (cell === current) break;
      sourceLine += cell.text.split("\n").length - 1;
    }
    const offset = current?.text.indexOf(sourceText) ?? -1;
    if (offset > 0)
      sourceLine += current!.text.slice(0, offset).split("\n").length - 1;
  }
  const activityTiming =
    isHeading &&
    ["WARMUP", "DISCOVERY", "PRACTICE", "APPLICATION"].includes(category) &&
    parseDuration(sourceText) !== null;
  if (!isHeading || activityTiming)
    ctx.a.sourceTraces.push({
      field: activityTiming ? "activityDurationMinutes" : field.split("[")[0],
      sourceText,
      lineStart: sourceLine,
      lineEnd: sourceLine + sourceText.split("\n").length - 1,
      confidence,
      blockId: block.id,
      tableIndex: ctx.tableIndices.get(block.id),
      periodId: ctx.periodId,
      row,
      column,
    });
  return c;
}

export function assign(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  category: Category,
  field: string,
  signals: string[],
  confidence: number,
  row?: number,
  column?: number,
) {
  const value = text.trim().replace(/^[-•*–]\s*/, "");
  if (!value) return;
  if (field.startsWith("activity.") && !ctx.active) {
    assign(
      ctx,
      block,
      text,
      "OTHER",
      "unmappedContent",
      ["Chưa có tiêu đề hoạt động; giữ nội dung để kiểm tra"],
      0.35,
      row,
      column,
    );
    return;
  }
  let target = field;
  const needsReview = confidence < 0.6 || category === "OTHER";
  if (needsReview) {
    target = "unmappedContent";
    category = "OTHER";
  }
  if (target.startsWith("activity.") && ctx.active) {
    const key = target.slice(9) as
      | "content"
      | "teacherActivity"
      | "studentActivity"
      | "goals"
      | "products"
      | "organization";
    const values = ctx.active[key];
    target = `teachingActivities[${ctx.a.teachingActivities.indexOf(ctx.active)}].${key}[${values.length}]`;
    values.push(value);
  } else {
    const values = ctx.a[target as keyof PedagogicalAnalysis];
    if (!Array.isArray(values)) return;
    target = `${target}[${values.length}]`;
    (values as string[]).push(value);
  }
  emit(
    ctx,
    block,
    text,
    category,
    target,
    signals,
    confidence,
    false,
    row,
    column,
    needsReview,
  );
}
