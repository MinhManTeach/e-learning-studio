// Classifies lesson-plan tables: label/value rows, header rows, full-width
// activity titles and data rows mapped through column roles.
import { activitySchema, type LessonDocumentBlock } from "../model";
import { normalizeHeading, parseDuration } from "../analyzer";
import { nonActivityBoundary, periodHeading } from "../activityStructure";
import { resolveCellRoles, type TableColumn } from "../tableRoles";
import type { StructureContext } from "./context";
import { startHeading } from "./headings";
import { identity } from "./identity";
import { paragraph } from "./paragraph";
import { assign, emit, source } from "./record";
import { cleaned, heading, type Category } from "./rules";

export function columnRule(ctx: StructureContext, text: string) {
  const n = normalizeHeading(cleaned(text)).replace(/[:.]$/g, "");
  if (
    /^(?:(?:hoat dong(?: cua)?|viec lam(?: cua)?) )?(?:giao vien|gv)$/.test(n)
  )
    return {
      category: "TEACHER_ACTIVITY" as Category,
      field: "activity.teacherActivity",
    };
  if (/^(?:(?:hoat dong(?: cua)?|viec lam(?: cua)?) )?(?:hoc sinh|hs)$/.test(n))
    return {
      category: "STUDENT_ACTIVITY" as Category,
      field: "activity.studentActivity",
    };
  if (/^(?:ho tro\s*)?(?:hskt|hoc sinh khuyet tat)$/.test(n))
    return {
      category: "SPECIAL_NEEDS" as Category,
      field: "specialNeedsSupport",
    };
  const activityContext = ctx.stack.some(
    (s) => s.field === "teachingActivities",
  );
  if (activityContext) {
    const cols: Record<string, string> = {
      "hoat dong": "title",
      "muc tieu": "goals",
      "noi dung": "content",
      "san pham": "products",
      "to chuc thuc hien": "organization",
      "danh gia": "assessmentEvidence",
    };
    if (n in cols)
      return {
        category:
          n === "danh gia"
            ? ("ASSESSMENT" as Category)
            : ("TEACHING_ACTIVITY" as Category),
        field:
          cols[n] === "assessmentEvidence"
            ? "assessmentEvidence"
            : `activity.${cols[n]}`,
      };
  }
  const h = heading(text);
  return h ? { category: h.category, field: h.field } : null;
}

export function recordSubactivity(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  text: string,
  row: number,
  column: number,
  allowUntimed = false,
) {
  if (!ctx.active || heading(text) || !/^\s*\d+[.):]+\s*/.test(text))
    return false;
  const duration = parseDuration(text);
  if (
    duration === null &&
    (!allowUntimed || text.length > 180 || /[.!?;:]\s*$/.test(text))
  )
    return false;
  (ctx.active.subactivities ??= []).push({
    title: cleaned(text),
    estimatedMinutes: duration,
    blockId: block.id,
    row,
    column,
    source: source(
      ctx,
      block,
      text,
      row,
      column,
      duration === null ? 0.7 : 0.9,
      duration === null,
    ),
  });
  emit(
    ctx,
    block,
    text,
    "TEACHING_ACTIVITY",
    "teachingActivities",
    ["Tiểu hoạt động trong hoạt động cha; giữ riêng thời lượng"],
    duration === null ? 0.7 : 0.9,
    true,
    row,
    column,
    duration === null,
  );
  return true;
}

type TableRow = NonNullable<LessonDocumentBlock["table"]>["rows"][number];
type TableCell = TableRow["cells"][number];
type ResolvedEntry = ReturnType<typeof resolveCellRoles>[number];
interface TableState {
  // Column roles from the latest header row; replaced by each new header row.
  columns: Map<number, TableColumn>;
  ambiguousRows: Set<number>;
}
interface RowView {
  row: TableRow;
  r: number;
  headers: {
    cell: TableCell;
    col: number;
    rule: ReturnType<typeof columnRule>;
  }[];
  // Number of cells whose text is a recognized column/section label.
  count: number;
  // Non-empty cells.
  single: TableCell[];
}

export function table(ctx: StructureContext, block: LessonDocumentBlock) {
  const state: TableState = { columns: new Map(), ambiguousRows: new Set() };
  block.table!.rows.forEach((row, r) => {
    const headers = row.cells.map((cell, i) => ({
      cell,
      col: cell.column ?? i,
      rule: columnRule(ctx, cell.text),
    }));
    const view: RowView = {
      row,
      r,
      headers,
      count: headers.filter((h) => h.rule).length,
      single: row.cells.filter((c) => c.text.trim()),
    };
    classifyRow(ctx, block, state, view);
  });
  if (state.ambiguousRows.size)
    ctx.a.sourceWarnings.push(
      `Bảng ${block.sourceOrder + 1} có ô gộp/ranh giới chưa rõ ở hàng ${[...state.ambiguousRows].map((r) => r + 1).join(", ")}; giữ nội dung để giáo viên kiểm tra.`,
    );
}

function classifyRow(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  state: TableState,
  view: RowView,
) {
  const { row, r, count, single } = view;
  if (single.length === 1 && periodHeading(single[0].text)) {
    paragraph(ctx, block, single[0].text, r, single[0].column ?? 0);
    return;
  }
  if (
    row.cells.length === 2 &&
    count === 0 &&
    /^(?:môn(?: học)?|lớp|tên bài|thời lượng|chương trình)\s*:??\s*$/iu.test(
      row.cells[0].text,
    )
  ) {
    identity(
      ctx,
      block,
      `${row.cells[0].text.replace(/:\s*$/, "")}: ${row.cells[1].text}`,
      r,
      row.cells[0].column ?? 0,
    );
    return;
  }
  if (labelValueRow(ctx, block, view)) return;
  if (headerRow(ctx, block, state, view)) return;
  if (fullWidthTitleRow(ctx, block, view)) return;
  activityTitleCell(ctx, block, state, view);
  for (const header of view.headers) dataCell(ctx, block, state, view, header);
}

// Two-cell row "label | value", e.g. "Mục tiêu | ...".
function labelValueRow(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  view: RowView,
) {
  const { row, r, headers, count } = view;
  if (
    row.cells.length === 2 &&
    count === 1 &&
    headers[0].rule &&
    headers[0].rule.field !== "teachingActivities" &&
    headers[0].rule.field !== "activity.title"
  ) {
    const { rule, cell } = headers[0];
    emit(
      ctx,
      block,
      cell.text,
      rule.category,
      "",
      ["+0.60 nhãn hàng bảng", "+0.20 ô giá trị kế bên"],
      0.8,
      true,
      r,
      0,
    );
    assign(
      ctx,
      block,
      row.cells[1].text,
      rule.category,
      rule.field,
      ["+0.60 nhãn hàng: " + cell.text, "+0.20 ô giá trị kế bên"],
      0.8,
      r,
      row.cells[1].column ?? 1,
    );
    return true;
  }
  return false;
}

// Header row: records the role of each column for the following rows.
function headerRow(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  state: TableState,
  view: RowView,
) {
  const { row, r, headers, count } = view;
  if (
    count >= 2 ||
    (r === 0 &&
      count === 1 &&
      row.cells.length === 1 &&
      headers[0].rule?.field !== "teachingActivities")
  ) {
    state.columns = new Map();
    for (const { cell, col, rule } of headers)
      if (rule) {
        for (let j = 0; j < (cell.colspan ?? 1); j++)
          state.columns.set(col + j, {
            ...rule,
            header: cell.text,
            reviewThrough:
              (cell.rowspan ?? 1) > 1 ? r + (cell.rowspan ?? 1) - 1 : undefined,
          });
        emit(
          ctx,
          block,
          cell.text,
          rule.category,
          "",
          ["+0.60 nhãn cột bảng", "+0.20 hàng tiêu đề"],
          0.8,
          true,
          r,
          col,
        );
      }
    return true;
  }
  return false;
}

function fullWidthTitleRow(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  view: RowView,
) {
  const { r, single } = view;
  // Full-width activity/section title inside a table retains the surrounding columns.
  if (single.length === 1 && !single[0].complex) {
    const cell = single[0];
    const texts = cell.paragraphs?.length
      ? cell.paragraphs
      : cell.text.split("\n");
    if (
      heading(texts[0] ?? "") ||
      (ctx.active &&
        /^\s*\d+[.):]+/.test(texts[0] ?? "") &&
        parseDuration(texts[0] ?? "") !== null)
    ) {
      let field = "activity.content";
      for (const text of texts) {
        if (
          (!ctx.active || text === texts[0] || /^\s*\d+[.)]/.test(text)) &&
          startHeading(ctx, block, text, r, cell.column ?? 0)
        )
          continue;
        const duration = parseDuration(text);
        if (
          ctx.active &&
          duration !== null &&
          recordSubactivity(ctx, block, text, r, cell.column ?? 0)
        )
          continue;
        const label = normalizeHeading(cleaned(text));
        if (/^muc tieu\s*:/.test(label)) {
          field = "activity.goals";
          const value = text.slice(text.indexOf(":") + 1).trim();
          if (value)
            assign(
              ctx,
              block,
              value,
              "TEACHING_ACTIVITY",
              field,
              ["Mục tiêu của hoạt động"],
              0.9,
              r,
              cell.column ?? 0,
            );
          emit(
            ctx,
            block,
            text,
            "TEACHING_ACTIVITY",
            "",
            ["Nhãn mục tiêu hoạt động"],
            0.9,
            true,
            r,
            cell.column ?? 0,
          );
        } else if (/^cach (?:thuc )?(?:tien hanh|thuc hien)/.test(label)) {
          field = "activity.teacherActivity";
          emit(
            ctx,
            block,
            text,
            "TEACHING_ACTIVITY",
            "",
            ["Nhãn tổ chức hoạt động"],
            0.9,
            true,
            r,
            cell.column ?? 0,
          );
        } else if (ctx.active)
          assign(
            ctx,
            block,
            text,
            "TEACHING_ACTIVITY",
            field,
            ["Đoạn trong ô cấu trúc của hoạt động"],
            0.85,
            r,
            cell.column ?? 0,
          );
        else paragraph(ctx, block, text, r, cell.column ?? 0);
      }
      return true;
    }
  }
  return false;
}

// The "Hoạt động" column of a data row starts (or continues) an activity.
function activityTitleCell(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  state: TableState,
  view: RowView,
) {
  const { r, headers } = view;
  const title = headers.find(
    (h) => state.columns.get(h.col)?.field === "activity.title",
  );
  if (
    title?.cell.text &&
    (nonActivityBoundary(title.cell.text) ||
      /^[.\s…_–-]+$/.test(title.cell.text.trim()) ||
      /^phan bo thoi (?:luong|gian)/.test(normalizeHeading(title.cell.text)))
  ) {
    paragraph(ctx, block, title.cell.text, r, title.col);
  } else if (title?.cell.text) {
    if (!startHeading(ctx, block, title.cell.text, r, title.col)) {
      ctx.active = activitySchema.parse({
        id: `${ctx.doc.id}-activity-${block.id}-${r}`,
        title: cleaned(title.cell.text),
        source: source(ctx, block, title.cell.text, r, title.col, 0.8),
        periodId: ctx.periodId,
        stage: null,
        content: [],
        estimatedMinutes: null,
      });
      ctx.a.teachingActivities.push(ctx.active);
      emit(
        ctx,
        block,
        title.cell.text,
        "TEACHING_ACTIVITY",
        `teachingActivities[${ctx.a.teachingActivities.length - 1}].title`,
        ["+0.60 cột Hoạt động", "+0.20 hàng dữ liệu"],
        0.8,
        false,
        r,
        title.col,
      );
    }
  }
}

function dataCell(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  state: TableState,
  view: RowView,
  { cell, col }: RowView["headers"][number],
) {
  const { row, r } = view;
  if (state.columns.get(col)?.field === "activity.title") return;
  let resolvedEntries = resolveCellRoles(cell, col, r, state.columns);
  const firstText = resolvedEntries[0]?.text;
  if (
    col === (row.cells[0].column ?? 0) &&
    firstText &&
    !cell.complex &&
    recordSubactivity(ctx, block, firstText, r, col, true)
  )
    resolvedEntries = resolvedEntries.slice(1);
  const meaningful = resolvedEntries.filter((e) => e.text.trim());
  if (
    meaningful.length &&
    meaningful.every((e) => !e.mapping) &&
    (state.columns.size || cell.complex || row.cells.length > 1)
  ) {
    if (state.columns.size || cell.complex) state.ambiguousRows.add(r);
    assign(
      ctx,
      block,
      meaningful.map((e) => e.text).join("\n"),
      "OTHER",
      "unmappedContent",
      ["Ô chưa rõ vai trò; giữ toàn bộ đoạn trong ô để kiểm tra"],
      0.35,
      r,
      col,
    );
    return;
  }
  for (const resolved of resolvedEntries)
    resolvedEntry(ctx, block, state, view, cell, col, resolved);
}

function resolvedEntry(
  ctx: StructureContext,
  block: LessonDocumentBlock,
  state: TableState,
  view: RowView,
  cell: TableCell,
  col: number,
  resolved: ResolvedEntry,
) {
  const { row, r } = view;
  if (!resolved.text.trim()) return;
  const mapping = resolved.mapping;
  if (mapping && (ctx.active || !mapping.field.startsWith("activity."))) {
    if (mapping.field === "specialNeedsSupport" && ctx.active)
      (ctx.active.specialNeedsSupport ??= []).push(resolved.text.trim());
    assign(
      ctx,
      block,
      resolved.text,
      mapping.category,
      mapping.field,
      [
        resolved.explicit
          ? "Nhãn vai trò ghi rõ trong đoạn; đối chiếu nhãn cột bảng"
          : "Ô nằm trọn trong phạm vi nhãn cột: " + mapping.header,
      ],
      resolved.explicit ? 0.9 : 0.8,
      r,
      col,
    );
  } else if (
    state.columns.size ||
    resolved.ambiguous ||
    cell.complex ||
    row.cells.length > 1
  ) {
    if (state.columns.size || cell.complex) state.ambiguousRows.add(r);
    assign(
      ctx,
      block,
      resolved.text,
      "OTHER",
      "unmappedContent",
      ["Ô giao vai trò, cấu trúc lồng hoặc thiếu nhãn; không tự gán"],
      0.35,
      r,
      col,
    );
  } else paragraph(ctx, block, resolved.text, r, col);
}
