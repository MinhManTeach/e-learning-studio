// Rule-based classification of an imported lesson plan into the pedagogical
// analysis. Each step lives under ./structure/; this file only orchestrates.
import type { ImportedLessonDocument, PedagogicalAnalysis } from "./model";
import { finalizeLessonDuration } from "./lessonMetadata";
import { finalizeActivityStructure } from "./activityStructure";
import { createContext } from "./structure/context";
import { paragraph } from "./structure/paragraph";
import { table } from "./structure/table";

export function classifyStructuredDocument(
  doc: ImportedLessonDocument,
  a: PedagogicalAnalysis,
) {
  const ctx = createContext(doc, a);
  a.sourceWarnings.push(...doc.extractionWarnings);
  for (const block of [...doc.blocks].sort(
    (x, y) => x.sourceOrder - y.sourceOrder,
  )) {
    if (block.type === "TABLE" && block.table) table(ctx, block);
    else
      for (const text of block.items?.length ? block.items : [block.text ?? ""])
        paragraph(ctx, block, text);
    ctx.line += (
      block.text ??
      block.table?.rows
        .map((r) => r.cells.map((c) => c.text).join("\t"))
        .join("\n") ??
      ""
    ).split("\n").length;
  }
  if (
    a.durationMinutes === null &&
    !a.periodCount &&
    a.teachingActivities.length &&
    a.teachingActivities.every((t) => t.estimatedMinutes !== null)
  ) {
    a.durationMinutes = a.teachingActivities.reduce(
      (sum, t) => sum + t.estimatedMinutes!,
      0,
    );
    a.sourceTraces.push(
      ...a.sourceTraces
        .filter((t) => t.field === "activityDurationMinutes")
        .map((t) => ({ ...t, field: "durationMinutes" })),
    );
  }
  finalizeLessonDuration(a);
  finalizeActivityStructure(a);
}
