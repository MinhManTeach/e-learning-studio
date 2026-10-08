import { z } from "zod";
import { zipSync, strToU8 } from "fflate";
import { parseProject, type LessonProject } from "../model/schema";
import { validateImageBlob } from "../media/storage";
import type { StoredMedia } from "../media/model";
import { safeMediaUrl } from "../media/model";
import { readBackupZip, backupLimits } from "./zip";
export interface BackupMediaReader {
  get(assetId: string, projectId: string): Promise<StoredMedia | undefined>;
}
const label = z.string().max(8000);
const url = label.refine(
  (v) =>
    !v ||
    (safeMediaUrl(v) &&
      !/[?&](?:token|key|api_key|secret|signature)=/i.test(v)),
);
const sourceSchema = z.strictObject({
  title: label,
  provider: z.enum(["WIKIMEDIA_COMMONS", "UPLOAD"]),
  sourceUrl: url,
  creator: label,
  license: label,
  licenseUrl: url,
  attribution: label,
});
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const backupManifestSchema = z.strictObject({
  format: z.literal("E_LEARNING_STUDIO_BACKUP"),
  version: z.literal(1),
  applicationVersion: z.literal("0.0.0"),
  schemaVersion: z.literal("2.2"),
  projectId: z.string().min(1).max(500),
  title: label,
  createdAt: z.iso.datetime(),
  project: z.strictObject({
    path: z.literal("project.json"),
    size: z.number().int().positive().max(backupLimits.json),
    sha256: checksum,
  }),
  unattachedSuggestions: z
    .array(z.string().min(1).max(500))
    .max(backupLimits.assets),
  assets: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(500),
        path: z.string().regex(/^assets\/[0-9]{4}\.(png|jpg|webp)$/),
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
        sha256: checksum,
        source: sourceSchema,
      }),
    )
    .max(backupLimits.assets),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export interface InspectedBackup {
  manifest: BackupManifest;
  project: LessonProject;
  media: StoredMedia[];
}
function fail(message: string): never {
  throw new Error(message);
}
export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
// Never read browser configuration/storage for an archive; reject suspicious payload fields instead of silently removing teacher content.
function portableData(value: unknown, depth = 0): void {
  if (depth > 60) fail("Dữ liệu sao lưu lồng quá sâu.");
  if (typeof value === "string") {
    if (
      /^(?:blob:|file:|[a-z]:[\\/]|\\\\)/i.test(value) ||
      /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[\w-]{25,}|Bearer\s+\S{12,})\b|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(
        value,
      )
    )
      fail(
        "Dữ liệu chứa đường dẫn thiết bị hoặc thông tin nhạy cảm; hãy kiểm tra trước khi sao lưu.",
      );
    if (/^https?:\/\//i.test(value)) {
      let address: URL;
      try {
        address = new URL(value);
      } catch {
        fail("Địa chỉ trong dữ liệu sao lưu không hợp lệ.");
      }
      if (
        address.username ||
        address.password ||
        /[?&](?:token|key|api_key|secret|signature)=/i.test(value)
      )
        fail(
          "Không nhận địa chỉ chứa thông tin đăng nhập hoặc khóa truy cập trong bản sao lưu.",
        );
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        /^(?:__proto__|prototype|constructor|api[_-]?key|password|secret|access[_-]?token|authorization)$/i.test(
          key,
        )
      )
        fail("Không nhận trường thông tin nhạy cảm trong bản sao lưu.");
      portableData(item, depth + 1);
    }
  }
}
function checkReferences(project: LessonProject) {
  for (const s of project.slides) {
    for (const id of [s.media.assetId, s.narration.assetId]) {
      if (id && !project.assets.some((a) => a.id === id))
        fail(
          `Thiếu hình ảnh trong bản sao lưu: trang “${s.title}”, asset ${id}.`,
        );
    }
    if (s.media.enabled && !s.media.assetId)
      fail(
        `Thiếu hình ảnh trong bản sao lưu: trang “${s.title}” chưa gắn ảnh.`,
      );
    if (s.narration.mode === "AUDIO_ASSET")
      fail(
        "Sao lưu phiên bản 1 chưa hỗ trợ tệp âm thanh; không thể tạo bản sao lưu đầy đủ.",
      );
  }
  for (const a of project.assets) {
    if (isUnattachedSuggestion(project, a.id)) continue;
    if (
      a.kind !== "IMAGE" ||
      a.status !== "LOCAL" ||
      a.url !== `local-media:${a.id}` ||
      !["image/png", "image/jpeg", "image/webp"].includes(a.mimeType)
    )
      fail(
        `Media “${a.name || a.id}” chưa được lưu thành ảnh cục bộ PNG/JPEG/WebP; không thể sao lưu đầy đủ.`,
      );
    if (/[\\/]/.test(a.fileName))
      fail(
        "Tên ảnh chứa đường dẫn thiết bị; hãy tải lại ảnh bằng thư viện hiện tại.",
      );
  }
}
function isUnattachedSuggestion(project: LessonProject, id: string) {
  const a = project.assets.find((item) => item.id === id);
  return (
    !!a &&
    a.kind === "IMAGE" &&
    a.sourceType === "LIBRARY" &&
    a.status === "EXTERNAL" &&
    !a.url &&
    !a.mimeType &&
    !a.fileName &&
    !project.slides.some(
      (s) => s.media.assetId === id || s.narration.assetId === id,
    )
  );
}
export async function createBackup(
  input: LessonProject,
  media: BackupMediaReader,
  progress: (text: string) => void = () => {},
) {
  try {
    return await collectBackup(input, media, progress);
  } catch (error) {
    if (error instanceof z.ZodError)
      fail(
        "Dữ liệu bài giảng hoặc thông tin ảnh chưa hợp lệ để sao lưu. Hãy kiểm tra ảnh và ghi công.",
      );
    throw error;
  }
}
async function collectBackup(
  input: LessonProject,
  media: BackupMediaReader,
  progress: (text: string) => void,
) {
  const project = parseProject(structuredClone(input));
  portableData(input);
  checkReferences(project);
  if (project.assets.length > backupLimits.assets)
    fail("Bản sao lưu không được quá 128 ảnh.");
  const projectBytes = strToU8(JSON.stringify(project));
  if (projectBytes.length > backupLimits.json)
    fail("Dữ liệu bài giảng vượt 2 MB.");
  const files: Record<string, Uint8Array> = Object.create(null);
  files["project.json"] = projectBytes;
  const inventory: BackupManifest["assets"] = [];
  let total = projectBytes.length;
  for (const [i, a] of project.assets.entries()) {
    if (isUnattachedSuggestion(project, a.id)) continue;
    progress(`Đang đóng gói hình ảnh… ${i + 1}/${project.assets.length}`);
    const stored = await media.get(a.id, project.projectId);
    if (!stored) {
      const slides = project.slides
        .filter((s) => s.media.assetId === a.id)
        .map((s) => s.title)
        .join(", ");
      fail(
        `Thiếu hình ảnh trong bản sao lưu: trang “${slides || "ảnh trong thư viện"}”, asset ${a.id}.`,
      );
    }
    if (
      stored.assetId !== a.id ||
      stored.projectId !== project.projectId ||
      stored.size !== stored.blob.size ||
      stored.mimeType !== a.mimeType ||
      (a.size !== undefined && a.size !== stored.size)
    )
      fail("Dữ liệu kho ảnh không khớp bài giảng.");
    await validateImageBlob(stored.blob);
    const bytes = new Uint8Array(await stored.blob.arrayBuffer());
    total += bytes.length;
    if (total > backupLimits.total) fail("Tổng dữ liệu sao lưu vượt 72 MB.");
    const extension =
      a.mimeType === "image/jpeg" ? "jpg" : a.mimeType.split("/")[1];
    const path = `assets/${String(i + 1).padStart(4, "0")}.${extension}`;
    portableData(stored.source);
    const source = sourceSchema.parse(stored.source);
    inventory.push({
      id: a.id,
      path,
      mimeType: a.mimeType as BackupManifest["assets"][number]["mimeType"],
      size: bytes.length,
      sha256: await sha256(bytes),
      source,
    });
    files[path] = bytes;
  }
  const manifest = backupManifestSchema.parse({
    format: "E_LEARNING_STUDIO_BACKUP",
    version: 1,
    applicationVersion: "0.0.0",
    schemaVersion: "2.2",
    projectId: project.projectId,
    title: project.metadata.projectTitle,
    createdAt: new Date().toISOString(),
    project: {
      path: "project.json",
      size: projectBytes.length,
      sha256: await sha256(projectBytes),
    },
    assets: inventory,
    unattachedSuggestions: project.assets
      .filter((a) => isUnattachedSuggestion(project, a.id))
      .map((a) => a.id),
  });
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  if (
    files["manifest.json"].length > backupLimits.json ||
    total + files["manifest.json"].length > backupLimits.total
  )
    fail("Bản sao lưu vượt giới hạn kích thước.");
  return zipSync(files, { level: 0 });
}
export async function inspectBackup(
  bytes: Uint8Array,
): Promise<InspectedBackup> {
  try {
    const files = readBackupZip(bytes);
    const decode = (name: string) =>
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(files.get(name)!),
      );
    const rawManifest: unknown = decode("manifest.json"),
      rawProject: unknown = decode("project.json");
    portableData(rawManifest);
    portableData(rawProject);
    const manifest = backupManifestSchema.parse(rawManifest),
      project = parseProject(rawProject);
    checkReferences(project);
    const suggestions = project.assets
      .filter((a) => isUnattachedSuggestion(project, a.id))
      .map((a) => a.id);
    if (
      JSON.stringify(manifest.unattachedSuggestions) !==
        JSON.stringify(suggestions) ||
      manifest.projectId !== project.projectId ||
      manifest.title !== project.metadata.projectTitle ||
      manifest.assets.length + suggestions.length !== project.assets.length ||
      files.size !== manifest.assets.length + 2
    )
      fail("Manifest không khớp bài giảng hoặc danh sách ảnh.");
    const projectBytes = files.get("project.json")!;
    if (
      manifest.project.size !== projectBytes.length ||
      manifest.project.sha256 !== (await sha256(projectBytes))
    )
      fail("Checksum bài giảng không khớp.");
    const ids = new Set<string>(),
      paths = new Set<string>();
    const restored: StoredMedia[] = [];
    for (const a of manifest.assets) {
      if (ids.has(a.id) || paths.has(a.path)) fail("Danh sách ảnh bị trùng.");
      ids.add(a.id);
      paths.add(a.path);
      const ref = project.assets.find((r) => r.id === a.id),
        data = files.get(a.path);
      const ext =
        a.mimeType === "image/jpeg" ? "jpg" : a.mimeType.split("/")[1];
      if (
        !ref ||
        ref.mimeType !== a.mimeType ||
        !a.path.endsWith(`.${ext}`) ||
        !data ||
        data.length !== a.size ||
        (ref.size !== undefined && ref.size !== a.size)
      )
        fail("Thiếu hình ảnh trong bản sao lưu hoặc inventory không khớp.");
      if (a.sha256 !== (await sha256(data)))
        fail("Checksum hình ảnh không khớp.");
      const blob = new Blob([new Uint8Array(data).buffer], {
        type: a.mimeType,
      });
      await validateImageBlob(blob);
      restored.push({
        assetId: a.id,
        projectId: project.projectId,
        blob,
        mimeType: a.mimeType,
        size: a.size,
        source: a.source,
      });
    }
    return { manifest, project, media: restored };
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof RangeError ||
      error instanceof TypeError
    )
      fail(
        "Tệp sao lưu không hợp lệ: kiểm tra phiên bản, dữ liệu và cấu trúc ZIP.",
      );
    throw error;
  }
}
