// Mutable state shared by the steps of one structured-document classification pass.
import type {
  ImportedLessonDocument,
  PedagogicalAnalysis,
  TeachingActivity,
} from "../model";
import type { Section } from "./rules";

export interface StructureContext {
  doc: ImportedLessonDocument;
  a: PedagogicalAnalysis;
  // Open headings, outermost first; drives which field plain text belongs to.
  stack: Section[];
  // Teaching activity that receives activity.* content, if any.
  active: TeachingActivity | undefined;
  // Teaching period (tiết) that new classifications belong to, if any.
  periodId: string | undefined;
  tableIndices: Map<string, number>;
  // Sequence for classification IDs.
  seq: number;
  // 1-based source line of the current block, for source traces.
  line: number;
}

export function createContext(
  doc: ImportedLessonDocument,
  a: PedagogicalAnalysis,
): StructureContext {
  return {
    doc,
    a,
    stack: [],
    active: undefined,
    periodId: undefined,
    tableIndices: new Map(
      doc.blocks.filter((b) => b.table).map((b, i) => [b.id, i]),
    ),
    seq: 0,
    line: 1,
  };
}
