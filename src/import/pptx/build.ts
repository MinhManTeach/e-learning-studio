import { createProject, createSlide } from "../../model/factories";
import {
  parseProject,
  type AssetReference,
  type LessonProject,
  type Slide,
  type Stage,
} from "../../model/schema";
import type { StoredMedia } from "../../media/model";
import {
  detectImageMime,
  detectVideoMime,
  maxImageBytes,
  maxVideoBytes,
} from "../../media/storage";
import type { DraftPage } from "./analyze";
import { readPptxParts } from "./parse";

/** A picture of a whole slide, exported by the teacher from PowerPoint. */
export interface SlidePicture {
  slide: number;
  name: string;
  bytes: Uint8Array;
}
export interface PptxBuildInput {
  title: string;
  subject: string;
  grade: string;
  /** Pages the teacher kept, in order, with any corrections already applied. */
  pages: DraftPage[];
  pptx: Uint8Array;
  slidePictures: SlidePicture[];
}
export interface PptxBuildResult {
  project: LessonProject;
  media: StoredMedia[];
  warnings: string[];
}

/** "Slide12.PNG", "Trang chiếu12.png", "bai4_12.jpg" -> 12 */
export function slideNumberFromName(name: string) {
  const match = name.replace(/\.[a-z0-9]+$/i, "").match(/(\d+)\D*$/);
  return match ? Number(match[1]) : undefined;
}

const stageWords: [RegExp, Stage][] = [
  [/KHỞI ĐỘNG|MỞ ĐẦU|YÊU CẦU CẦN ĐẠT|MỤC TIÊU/i, "OPENING"],
  [/KHÁM PHÁ|HÌNH THÀNH|TÌM HIỂU/i, "DISCOVERY"],
  [/THỰC HÀNH|TÌNH HUỐNG|THẢO LUẬN/i, "PRACTICE"],
  [/LUYỆN TẬP|CỦNG CỐ|TRÒ CHƠI|CÂU HỎI|KIỂM TRA/i, "ASSESSMENT"],
  [/VẬN DỤNG|GHI NHỚ|TỔNG KẾT|DẶN DÒ|HOÀN THÀNH/i, "APPLICATION"],
];
const stageOf = (title: string) =>
  stageWords.find(([re]) => re.test(title))?.[1];

const letter = (i: number) => String.fromCharCode(65 + i);

export function buildLessonFromPptx(input: PptxBuildInput): PptxBuildResult {
  const warnings: string[] = [];
  const project = createProject(
    input.title.trim() || "Bài giảng từ PowerPoint",
  );
  project.metadata = {
    ...project.metadata,
    subject: input.subject.trim(),
    grade: input.grade.trim(),
  };
  const assets: AssetReference[] = [];
  const media: StoredMedia[] = [];

  // Media parts from the PowerPoint, read once.
  const wanted = new Set<string>();
  for (const p of input.pages) {
    if (p.kind === "VIDEO") wanted.add(p.video);
    if (p.kind === "PAGE" && p.picture) wanted.add(p.picture);
    if (p.kind === "QUESTIONS")
      for (const q of p.questions)
        for (const o of q.options) if (o.image) wanted.add(o.image);
  }
  const parts = readPptxParts(input.pptx, [...wanted]);
  const byPart = new Map<string, string>(); // zip path -> asset id
  function addAsset(
    id: string,
    bytes: Uint8Array,
    name: string,
    altText: string,
    where: string,
  ): string | undefined {
    const image = detectImageMime(bytes.slice(0, 16));
    const video = image ? "" : detectVideoMime(bytes.slice(0, 16));
    const mime = image || video;
    if (!mime) {
      warnings.push(`${where}: bỏ qua “${name}” vì định dạng chưa hỗ trợ.`);
      return undefined;
    }
    if (bytes.length > (video ? maxVideoBytes : maxImageBytes)) {
      warnings.push(
        `${where}: bỏ qua “${name}” vì quá lớn (${(bytes.length / 1048576).toFixed(1)} MB).`,
      );
      return undefined;
    }
    assets.push({
      id,
      kind: video ? "VIDEO" : "IMAGE",
      sourceType: "UPLOAD",
      name,
      fileName: name,
      mimeType: mime,
      size: bytes.length,
      url: `local-media:${id}`,
      altText,
      status: "LOCAL",
    });
    media.push({
      assetId: id,
      projectId: project.projectId,
      blob: new Blob([new Uint8Array(bytes)], { type: mime }),
      mimeType: mime,
      size: bytes.length,
      source: {
        title: name,
        provider: "UPLOAD",
        sourceUrl: "",
        creator: "",
        license: "",
        licenseUrl: "",
        attribution: "",
      },
    });
    return id;
  }
  function partAsset(path: string, altText: string, where: string) {
    if (byPart.has(path)) return byPart.get(path);
    const bytes = parts[path];
    const name = path.split("/").at(-1) ?? path;
    if (!bytes) {
      warnings.push(`${where}: không tìm thấy “${name}” trong tệp PowerPoint.`);
      return undefined;
    }
    const id = addAsset(
      `pptx-${name.replace(/\W+/g, "-")}`,
      bytes,
      name,
      altText,
      where,
    );
    if (id) byPart.set(path, id);
    return id;
  }
  const pictures = new Map(input.slidePictures.map((p) => [p.slide, p]));

  const slides: Slide[] = [];
  let stage: Stage = "OPENING";
  for (const page of input.pages) {
    const where = `Slide ${page.slide}`;
    stage = stageOf(page.title) ?? stage;
    if (page.kind === "QUESTIONS") {
      const s = createSlide("quiz");
      s.title = page.title || "Câu hỏi";
      s.pedagogicalStage = stageOf(page.title) ?? "ASSESSMENT";
      s.data.questions = page.questions.map((q, qi) => {
        const options = q.options.slice(0, 6).map((o, i) => ({
          id: crypto.randomUUID(),
          text: o.text || letter(i),
          imageAssetId: o.image
            ? partAsset(o.image, `Đáp án ${letter(i)}`, where)
            : undefined,
        }));
        if (q.correct.length !== 1)
          warnings.push(
            `${where}, câu ${qi + 1}: ${
              q.correct.length
                ? "PowerPoint có nhiều đáp án đúng"
                : "chưa rõ đáp án đúng"
            }; hãy kiểm tra lại trong trình soạn.`,
          );
        return {
          id: crypto.randomUUID(),
          level: "RECOGNITION" as const,
          prompt: q.prompt || "Câu hỏi",
          options,
          correctAnswerIndex: Math.min(q.correct[0] ?? 0, options.length - 1),
          explanation: q.explanation,
          points: 10,
        };
      });
      if (page.questions.some((q) => q.correct.length !== 1))
        s.teacherNotes =
          "Cần kiểm tra đáp án đúng: PowerPoint không cho biết rõ một đáp án duy nhất.";
      slides.push(s);
      continue;
    }
    const s = createSlide("content");
    s.title = page.title;
    s.pedagogicalStage = stage;
    s.teacherNotes = page.notes.join("\n");
    if (page.kind === "PAGE") {
      s.data.bulletPoints = page.text;
      s.voiceScript = [page.title, ...page.text].join(". ");
    }
    const picture = pictures.get(page.slide);
    const assetId =
      page.kind === "VIDEO"
        ? partAsset(page.video, page.title, where)
        : picture
          ? addAsset(
              `slide-${page.slide}`,
              picture.bytes,
              picture.name,
              [page.title, ...(page.kind === "PAGE" ? page.text : [])]
                .join(". ")
                .slice(0, 500),
              where,
            )
          : page.picture
            ? partAsset(page.picture, page.title, where)
            : undefined;
    if (assetId) {
      s.media = { ...s.media, enabled: true, assetId };
      // Videos, the teacher's own slide pictures and picture-only slides fill
      // the page; a single picture taken from the slide sits beside the text.
      s.layout =
        page.kind === "VIDEO" || picture || (page.kind === "PAGE" && page.cover)
          ? "MEDIA_COVER"
          : "TEXT_LEFT_MEDIA_RIGHT";
    }
    slides.push(s);
  }
  const done = createSlide("completion");
  done.title = "Hoàn thành bài học";
  done.data.message = "Em đã hoàn thành bài học. Chúc mừng em!";
  slides.push(done);

  project.slides = slides;
  project.assets = assets;
  project.settings = {
    ...project.settings,
    requireAllSlides: false,
    requireQuiz: slides.some((s) => s.type === "quiz"),
  };
  return { project: parseProject(project), media, warnings };
}
