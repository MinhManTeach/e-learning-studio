import { strToU8, zipSync, type Zippable } from "fflate";
import { parseProject, type LessonProject } from "../model/schema";
import type { StoredMedia } from "../media/model";
import { detectImageMime } from "../media/storage";
import type { PlayerPackageData } from "./playerData";
import { playerDataGlobal } from "./playerData";

export interface PlayerAssets {
  js: string;
  css: string;
}
export interface ExportMediaReader {
  get(assetId: string, projectId: string): Promise<StoredMedia | undefined>;
}
export interface ExportIssue {
  level: "BLOCK" | "WARN";
  message: string;
}
export interface LessonPackage {
  bytes: Uint8Array;
  fileName: string;
  imageCount: number;
}

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const pageName = (p: LessonProject, slideId: string) => {
  const i = p.slides.findIndex((s) => s.id === slideId);
  return `trang ${i + 1} “${p.slides[i]?.title ?? ""}”`;
};

function shownImages(p: LessonProject) {
  const used = new Map<string, string>(); // assetId -> first slide id
  for (const s of p.slides)
    if (s.media.enabled && s.media.assetId && !used.has(s.media.assetId))
      used.set(s.media.assetId, s.id);
  return [...used].flatMap(([id, slideId]) => {
    const asset = p.assets.find((a) => a.id === id && a.kind === "IMAGE");
    return asset ? [{ asset, slideId }] : [];
  });
}

/** Problems a teacher should know about before exporting. BLOCK stops the export. */
export function exportIssues(p: LessonProject): ExportIssue[] {
  const issues: ExportIssue[] = [];
  if (!p.slides.length)
    issues.push({ level: "BLOCK", message: "Bài giảng chưa có trang nào." });
  const external = shownImages(p).filter(
    ({ asset }) => asset.status !== "LOCAL",
  );
  if (external.length)
    issues.push({
      level: "WARN",
      message: `${external.length} ảnh lấy từ Internet (ví dụ ${pageName(p, external[0].slideId)}). Học sinh cần có mạng để thấy các ảnh này.`,
    });
  const emptyQuiz = p.slides.find(
    (s) => s.type === "quiz" && !s.data.questions.length,
  );
  if (emptyQuiz)
    issues.push({
      level: "WARN",
      message: `${pageName(p, emptyQuiz.id)} là trang trắc nghiệm chưa có câu hỏi.`,
    });
  if (p.slides.some((s) => s.narration.mode === "AUDIO_ASSET"))
    issues.push({
      level: "WARN",
      message:
        "Gói chưa hỗ trợ tệp thuyết minh ghi âm; các trang đó sẽ không có âm thanh.",
    });
  return issues;
}

/** Removes what is for the teacher only: notes, source excerpts and file origins. */
export function studentCopy(p: LessonProject): LessonProject {
  return parseProject({
    ...p,
    slides: p.slides.map((s) => ({
      ...s,
      teacherNotes: "",
      sourceContext: undefined,
    })),
    assets: p.assets.map((a) => ({ ...a, docxSource: undefined })),
  });
}

export function packageFileName(title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "bai-giang"}-scorm.zip`;
}

const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );

export function scormManifest(p: LessonProject, files: string[]) {
  const id = "LESSON-" + p.projectId.replace(/[^A-Za-z0-9_.-]/g, "-");
  const title = xml(p.metadata.projectTitle || "Bài giảng");
  const hasQuiz = p.slides.some(
    (s) => s.type === "quiz" && s.data.questions.length,
  );
  const mastery = hasQuiz
    ? `\n        <adlcp:masteryscore>${Math.round(p.settings.passingScore)}</adlcp:masteryscore>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${title}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${title}</title>${mastery}
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files.map((f) => `      <file href="${xml(f)}"/>`).join("\n")}
    </resource>
  </resources>
</manifest>
`;
}

function indexHtml(p: LessonProject) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xml(p.metadata.projectTitle || "Bài giảng")}</title>
<link rel="stylesheet" href="player.css">
</head>
<body>
<div id="root"></div>
<noscript>Hãy bật JavaScript trong trình duyệt để học bài giảng này.</noscript>
<script src="lesson-data.js"></script>
<script src="player.js"></script>
</body>
</html>
`;
}

const guide = `HƯỚNG DẪN SỬ DỤNG GÓI BÀI GIẢNG

1. Đưa lên LMS (Moodle, K12Online, vnEdu...):
   Tải nguyên tệp ZIP này lên mục "Gói SCORM" (SCORM 1.2). Không giải nén.
   LMS sẽ ghi nhận tiến độ, điểm và trạng thái đạt/chưa đạt.

2. Học không cần mạng:
   Giải nén toàn bộ tệp ZIP vào một thư mục, rồi nháy đúp vào index.html.
   Chạy được trên Chrome, Edge, Cốc Cốc, Firefox. Tiến độ được nhớ trên máy đó.

Ảnh lấy từ Internet (nếu có) chỉ hiện khi máy có mạng.
`;

/** Builds the ZIP from the teacher's current edited lesson. Nothing is regenerated. */
export async function buildLessonPackage(
  project: LessonProject,
  media: ExportMediaReader,
  player: PlayerAssets,
): Promise<LessonPackage> {
  const p = studentCopy(project);
  const blocking = exportIssues(p).filter((x) => x.level === "BLOCK");
  if (blocking.length) throw new Error(blocking[0].message);
  const entries: Zippable = {};
  const files: Record<string, string> = {};
  let n = 0;
  for (const { asset, slideId } of shownImages(p)) {
    if (asset.status !== "LOCAL") continue;
    const stored = await media.get(asset.id, project.projectId);
    if (!stored)
      throw new Error(
        `Thiếu ảnh “${asset.name || asset.fileName}” ở ${pageName(p, slideId)}. Hãy tải ảnh lên lại rồi xuất gói.`,
      );
    const bytes = new Uint8Array(await stored.blob.arrayBuffer());
    const mime = detectImageMime(bytes);
    if (!extensions[mime])
      throw new Error(
        `Ảnh ở ${pageName(p, slideId)} không phải PNG, JPEG hoặc WebP hợp lệ.`,
      );
    const path = `media/${String(++n).padStart(4, "0")}.${extensions[mime]}`;
    files[asset.id] = path;
    entries[path] = [bytes, { level: 0 }]; // already compressed
  }
  const data: PlayerPackageData = {
    format: "E_LEARNING_STUDIO_PLAYER",
    version: 1,
    project: p,
    files,
  };
  entries["index.html"] = strToU8(indexHtml(p));
  entries["player.js"] = strToU8(player.js);
  entries["player.css"] = strToU8(player.css);
  entries["lesson-data.js"] = strToU8(
    `window.${playerDataGlobal} = ${JSON.stringify(data)};\n`,
  );
  entries["HUONG_DAN.txt"] = strToU8(guide);
  entries["imsmanifest.xml"] = strToU8(
    scormManifest(p, Object.keys(entries).sort()),
  );
  return {
    bytes: zipSync(entries, { level: 6 }),
    fileName: packageFileName(p.metadata.projectTitle),
    imageCount: n,
  };
}
