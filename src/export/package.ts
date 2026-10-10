import { strToU8, zipSync, type Zippable } from "fflate";
import { parseProject, type LessonProject } from "../model/schema";
import type { StoredMedia } from "../media/model";
import { detectImageMime, detectVideoMime } from "../media/storage";
import type { PlayerPackageData } from "./playerData";
import { lessonSpeechPieces } from "../player/readAloud";
import { detectAudioMime } from "../media/storage";
import { voiceAssetId } from "../voice/voiceover";
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
/** Which SCORM edition the package declares; the player itself handles both. */
export type ScormVersion = "1.2" | "2004";
export const scormVersions: ScormVersion[] = ["1.2", "2004"];
export interface LessonPackage {
  bytes: Uint8Array;
  fileName: string;
  scorm: ScormVersion;
  imageCount: number;
  videoCount: number;
  /** Recorded voice pieces packed in ("Tạo giọng đọc"). */
  voiceCount: number;
  /** Pieces the lesson reads that have no recording yet. */
  voiceMissing: number;
}

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
/** Recognises the file by its bytes, not by its name or claimed type. */
export function detectMediaMime(bytes: Uint8Array) {
  return detectImageMime(bytes) || detectVideoMime(bytes);
}
const pageName = (p: LessonProject, slideId: string) => {
  const i = p.slides.findIndex((s) => s.id === slideId);
  return `trang ${i + 1} “${p.slides[i]?.title ?? ""}”`;
};

/** Images and videos students will actually see, with the first page showing each. */
function shownMedia(p: LessonProject) {
  const used = new Map<string, string>(); // assetId -> first slide id
  const use = (id: string | null | undefined, slideId: string) => {
    if (id && !used.has(id)) used.set(id, slideId);
  };
  for (const s of p.slides) {
    if (s.media.enabled) use(s.media.assetId, s.id);
    // Pictures on answer cards.
    if (s.type === "warmup")
      for (const item of s.data.items) use(item.imageAssetId, s.id);
    if (s.type === "scenario")
      for (const choice of s.data.choices) use(choice.imageAssetId, s.id);
    if (s.type === "quiz")
      for (const q of s.data.questions)
        for (const o of q.options) use(o.imageAssetId, s.id);
    if (s.type === "cards" || s.type === "activity")
      for (const item of s.data.items) use(item.imageAssetId, s.id);
  }
  return [...used].flatMap(([id, slideId]) => {
    const asset = p.assets.find(
      (a) => a.id === id && (a.kind === "IMAGE" || a.kind === "VIDEO"),
    );
    return asset ? [{ asset, slideId }] : [];
  });
}
const mediaWord = (kind: string) => (kind === "VIDEO" ? "video" : "ảnh");

/** Problems a teacher should know about before exporting. BLOCK stops the export. */
export function exportIssues(p: LessonProject): ExportIssue[] {
  const issues: ExportIssue[] = [];
  if (!p.slides.length)
    issues.push({ level: "BLOCK", message: "Bài giảng chưa có trang nào." });
  const external = shownMedia(p).filter(
    ({ asset }) => asset.status !== "LOCAL",
  );
  if (external.length)
    issues.push({
      level: "WARN",
      message: `${external.length} ảnh/video lấy từ Internet (ví dụ ${pageName(p, external[0].slideId)}). Học sinh cần có mạng để xem các nội dung này.`,
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

export function packageFileName(title: string, scorm: ScormVersion = "1.2") {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "bai-giang"}-${scorm === "2004" ? "scorm2004" : "scorm"}.zip`;
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

export function scormManifest(
  p: LessonProject,
  files: string[],
  scorm: ScormVersion = "1.2",
) {
  const id = "LESSON-" + p.projectId.replace(/[^A-Za-z0-9_.-]/g, "-");
  const title = xml(p.metadata.projectTitle || "Bài giảng");
  if (scorm === "2004") return scorm2004Manifest(id, title, files);
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

/**
 * SCORM 2004 4th Edition, one SCO. The lesson reports completion and pass/fail
 * itself (with the teacher's passing score), so the LMS is told not to work
 * them out from its own rules.
 */
function scorm2004Manifest(id: string, title: string, files: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${title}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${title}</title>
        <imsss:sequencing>
          <imsss:deliveryControls completionSetByContent="true" objectiveSetByContent="true"/>
        </imsss:sequencing>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormType="sco" href="index.html">
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

const guide = (scorm: ScormVersion) => `HƯỚNG DẪN SỬ DỤNG GÓI BÀI GIẢNG

1. Đưa lên LMS (LMS360, Moodle, K12Online, vnEdu...):
   Tải nguyên tệp ZIP này lên mục "Gói SCORM" (SCORM ${scorm}). Không giải nén.
   LMS sẽ ghi nhận tiến độ, điểm và trạng thái đạt/chưa đạt.

2. Học không cần mạng:
   Giải nén toàn bộ tệp ZIP vào một thư mục, rồi nháy đúp vào index.html.
   Chạy được trên Chrome, Edge, Cốc Cốc, Firefox. Tiến độ được nhớ trên máy đó.

Ảnh và video lấy từ Internet (nếu có) chỉ hiện khi máy có mạng.
`;

/** Builds the ZIP from the teacher's current edited lesson. Nothing is regenerated. */
export async function buildLessonPackage(
  project: LessonProject,
  media: ExportMediaReader,
  player: PlayerAssets,
  options: { scorm?: ScormVersion } = {},
): Promise<LessonPackage> {
  const scorm = options.scorm ?? "1.2";
  const p = studentCopy(project);
  const blocking = exportIssues(p).filter((x) => x.level === "BLOCK");
  if (blocking.length) throw new Error(blocking[0].message);
  const entries: Zippable = {};
  const files: Record<string, string> = {};
  let images = 0;
  let videos = 0;
  for (const { asset, slideId } of shownMedia(p)) {
    if (asset.status !== "LOCAL") continue;
    const word = mediaWord(asset.kind);
    const stored = await media.get(asset.id, project.projectId);
    if (!stored)
      throw new Error(
        `Thiếu ${word} “${asset.name || asset.fileName}” ở ${pageName(p, slideId)}. Hãy tải ${word} lên lại rồi xuất gói.`,
      );
    const bytes = new Uint8Array(await stored.blob.arrayBuffer());
    const mime = detectMediaMime(bytes);
    const isVideo = mime.startsWith("video/");
    if (!extensions[mime] || isVideo !== (asset.kind === "VIDEO"))
      throw new Error(
        asset.kind === "VIDEO"
          ? `Video ở ${pageName(p, slideId)} không phải MP4 hoặc WebM hợp lệ.`
          : `Ảnh ở ${pageName(p, slideId)} không phải PNG, JPEG hoặc WebP hợp lệ.`,
      );
    const n = isVideo ? ++videos : ++images;
    const path = `media/${isVideo ? "video-" : ""}${String(n).padStart(4, "0")}.${extensions[mime]}`;
    files[asset.id] = path;
    entries[path] = [bytes, { level: 0 }]; // already compressed
  }
  // Recorded voice: only pieces this lesson still reads, so edited-away
  // sentences are not shipped. Missing ones fall back to the browser's voice.
  const voice: Record<string, string> = {};
  let voiceMissing = 0;
  for (const piece of lessonSpeechPieces(p)) {
    const stored = await Promise.resolve()
      .then(() => media.get(voiceAssetId(piece.key), project.projectId))
      .catch(() => undefined);
    const bytes = stored
      ? new Uint8Array(await stored.blob.arrayBuffer())
      : undefined;
    if (!bytes || detectAudioMime(bytes) !== "audio/mp4") {
      voiceMissing++;
      continue;
    }
    const path = `voice/${String(Object.keys(voice).length + 1).padStart(4, "0")}.m4a`;
    voice[piece.key] = path;
    entries[path] = [bytes, { level: 0 }]; // already compressed
  }
  const data: PlayerPackageData = {
    format: "E_LEARNING_STUDIO_PLAYER",
    version: 1,
    project: p,
    files,
    ...(Object.keys(voice).length ? { voice } : {}),
  };
  entries["index.html"] = strToU8(indexHtml(p));
  entries["player.js"] = strToU8(player.js);
  entries["player.css"] = strToU8(player.css);
  entries["lesson-data.js"] = strToU8(
    `window.${playerDataGlobal} = ${JSON.stringify(data)};\n`,
  );
  entries["HUONG_DAN.txt"] = strToU8(guide(scorm));
  entries["imsmanifest.xml"] = strToU8(
    scormManifest(p, Object.keys(entries).sort(), scorm),
  );
  return {
    bytes: zipSync(entries, { level: 6 }),
    fileName: packageFileName(p.metadata.projectTitle, scorm),
    scorm,
    imageCount: images,
    videoCount: videos,
    voiceCount: Object.keys(voice).length,
    voiceMissing,
  };
}
