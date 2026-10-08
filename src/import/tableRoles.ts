import { normalizeHeading } from "./analyzer";
import type { BlockClassification, LessonDocumentBlock } from "./model";
export type TableColumn = {
  category: BlockClassification["category"];
  field: string;
  header: string;
  reviewThrough?: number;
};
export function explicitParagraphRole(text: string): TableColumn | null {
  const n = normalizeHeading(text).replace(/^[-•*–]\s*/, "");
  const marker = n.match(
    /^(hskt|hoc sinh khuyet tat|gv|giao vien|hs|hoc sinh)(?:\s*[:：]\s*|\s+)/,
  )?.[1];
  if (!marker) return null;
  if (/^(?:hskt|hoc sinh khuyet tat)$/.test(marker))
    return {
      category: "SPECIAL_NEEDS",
      field: "specialNeedsSupport",
      header: marker,
    };
  return /^(?:gv|giao vien)$/.test(marker)
    ? {
        category: "TEACHER_ACTIVITY",
        field: "activity.teacherActivity",
        header: marker,
      }
    : {
        category: "STUDENT_ACTIVITY",
        field: "activity.studentActivity",
        header: marker,
      };
}
/** Resolve each paragraph from its own cell interval and explicit labels, never a table-wide flag. */
export function resolveCellRoles(
  cell: NonNullable<
    LessonDocumentBlock["table"]
  >["rows"][number]["cells"][number],
  column: number,
  row: number,
  columns: Map<number, TableColumn>,
) {
  const covered = Array.from({ length: cell.colspan ?? 1 }, (_, j) =>
    columns.get(column + j),
  );
  const first = covered[0];
  const crosses = covered.some((c) => c?.field !== first?.field);
  const verticalBoundary = [...columns.values()].some(
    (c) => c.reviewThrough !== undefined && c.reviewThrough >= row,
  );
  const blocked = cell.complex || (cell.rowspan ?? 1) > 1 || verticalBoundary;
  const geometry = !blocked && !crosses ? first : undefined;
  return (
    cell.paragraphs?.length ? cell.paragraphs : cell.text.split("\n")
  ).map((text) => {
    const explicit = blocked ? null : explicitParagraphRole(text);
    const contradiction =
      explicit &&
      geometry &&
      explicit.field !== geometry.field &&
      explicit.field !== "specialNeedsSupport";
    return {
      text,
      mapping: contradiction ? undefined : (explicit ?? geometry),
      explicit: !!explicit,
      ambiguous: !!blocked || crosses || !!contradiction,
    };
  });
}
