import { z } from "zod";
export const mediaStatuses = [
  "NEEDS_MEDIA",
  "SEARCHING",
  "CANDIDATES_READY",
  "SELECTED",
  "STORED",
  "MISSING",
  "EXTERNAL_DEPENDENCY",
  "ERROR",
  "SKIPPED",
] as const;
export type MediaStatus = (typeof mediaStatuses)[number];
export function safeMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function isReusableLicense(license: string) {
  return /^(?:CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)? [1-4]\.0|CC BY(?:-SA)? 2\.5)$/i.test(
    license.trim(),
  );
}
const secureUrl = z.string().refine(safeMediaUrl, "URL ảnh phải dùng HTTPS.");
export const mediaCandidateSchema = z.object({
  id: z.string().min(1),
  provider: z.literal("WIKIMEDIA_COMMONS"),
  title: z.string().min(1).max(2000),
  thumbnailUrl: secureUrl,
  downloadUrl: secureUrl,
  sourceUrl: secureUrl,
  creator: z.string().max(4000),
  license: z.string().max(200),
  licenseUrl: z.string().refine((v) => !v || safeMediaUrl(v)),
  attribution: z.string().max(8000),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
export type MediaCandidate = z.infer<typeof mediaCandidateSchema>;
export interface MediaSourceMetadata {
  title: string;
  provider: "WIKIMEDIA_COMMONS" | "UPLOAD" | "DOCX";
  sourceUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}
export interface StoredMedia {
  assetId: string;
  projectId: string;
  blob: Blob;
  mimeType: string;
  size: number;
  source: MediaSourceMetadata;
}
export interface MediaSearchProvider {
  readonly id: string;
  search(query: string, signal?: AbortSignal): Promise<MediaCandidate[]>;
}
export function plainMetadata(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:amp|quot|lt|gt|#39);/g,
      (x) =>
        ({
          "&amp;": "&",
          "&quot;": '"',
          "&lt;": "<",
          "&gt;": ">",
          "&#39;": "'",
        })[x] ?? x,
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}
