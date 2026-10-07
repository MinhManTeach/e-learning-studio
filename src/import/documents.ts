import { importedDocumentSchema, type ImportedLessonDocument } from "./model";
import { textBlocks } from "./blocks";
export const importLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxCharacters: 200_000,
};
export const supportedPlanFormats = [
  { extension: "TXT", supported: true },
  { extension: "DOCX", supported: true },
  { extension: "PDF", supported: false },
] as const;
function validateText(rawText: string) {
  if (!rawText.trim())
    throw new Error(
      "Kế hoạch chưa có nội dung. Thầy/cô hãy dán văn bản hoặc chọn tệp TXT có nội dung.",
    );
  if (rawText.length > importLimits.maxCharacters)
    throw new Error("Kế hoạch quá dài. Vui lòng dùng tối đa 200.000 ký tự.");
  if (/\u0000/.test(rawText))
    throw new Error(
      "Tệp có dữ liệu không phải văn bản. Hãy lưu lại dưới dạng TXT UTF-8.",
    );
  return rawText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}
export function importPastedPlan(rawText: string): ImportedLessonDocument {
  const normalized = validateText(rawText);
  return importedDocumentSchema.parse({
    id: crypto.randomUUID(),
    sourceType: "PASTE",
    rawText: normalized,
    blocks: textBlocks(normalized),
    importedAt: new Date().toISOString(),
  });
}
export interface PlanFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export async function importPlanFile(
  file: PlanFile,
): Promise<ImportedLessonDocument> {
  if (file.size > importLimits.maxBytes)
    throw new Error("Tệp quá lớn. Vui lòng chọn TXT hoặc DOCX dưới 2 MB.");
  const extension = file.name.split(".").at(-1)?.toUpperCase();
  if (extension !== "TXT" && extension !== "DOCX")
    throw new Error(
      extension === "PDF"
        ? `${extension}: sắp hỗ trợ. Hiện tại, thầy/cô có thể sao chép nội dung hoặc dùng TXT UTF-8.`
        : "Định dạng chưa được hỗ trợ. Hãy chọn DOCX hoặc TXT UTF-8.",
    );
  let text: string;
  if (extension === "DOCX") {
    const { extractDocx } = await import("./docx");
    const extracted = extractDocx(new Uint8Array(await file.arrayBuffer()));
    return importedDocumentSchema.parse({
      id: crypto.randomUUID(),
      sourceType: "DOCX",
      fileName: file.name,
      rawText: validateText(extracted.rawText),
      blocks: extracted.blocks,
      extractionWarnings: extracted.warnings,
      importedAt: new Date().toISOString(),
    });
  }
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error(
      "Không đọc được văn bản UTF-8. Vui lòng lưu lại tệp dưới dạng TXT UTF-8.",
    );
  }
  return importedDocumentSchema.parse({
    id: crypto.randomUUID(),
    sourceType: "TXT",
    fileName: file.name,
    rawText: validateText(text),
    blocks: textBlocks(validateText(text)),
    importedAt: new Date().toISOString(),
  });
}
