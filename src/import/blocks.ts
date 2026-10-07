import type { LessonDocumentBlock } from "./model";
export function textBlocks(rawText: string): LessonDocumentBlock[] {
  return rawText
    .split("\n")
    .map((text, i) => ({
      id: `line-${i + 1}`,
      type: /^\s*[-•*–]/.test(text)
        ? ("LIST" as const)
        : ("PARAGRAPH" as const),
      text,
      sourceOrder: i,
      ...(/^\s*[-•*–]/.test(text) ? { items: [text] } : {}),
    }))
    .filter((b) => b.text.trim());
}
