import { importedDocumentSchema, type ImportedLessonDocument } from "./model";
export const importLimits = {
  maxBytes: 2 * 1024 * 1024,
  maxCharacters: 200_000,
};
export const supportedPlanFormats = [
  { extension: "TXT", supported: true },
  { extension: "DOCX", supported: false },
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
  return importedDocumentSchema.parse({
    id: crypto.randomUUID(),
    sourceType: "PASTE",
    rawText: validateText(rawText),
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
    throw new Error("Tệp quá lớn. Vui lòng chọn TXT dưới 2 MB.");
  const extension = file.name.split(".").at(-1)?.toUpperCase();
  if (extension !== "TXT")
    throw new Error(
      extension === "DOCX" || extension === "PDF"
        ? `${extension}: sắp hỗ trợ. Hiện tại, thầy/cô có thể sao chép nội dung hoặc dùng TXT UTF-8.`
        : "Định dạng chưa được hỗ trợ. Hãy chọn TXT UTF-8.",
    );
  let text: string;
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
    importedAt: new Date().toISOString(),
  });
}
