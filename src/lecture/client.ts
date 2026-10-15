// The editor's side of "Lời giảng": asks the AI to write it, asks the server
// to speak it, and keeps every spoken piece with the lesson as an AUDIO asset.
import type {
  AssetReference,
  BasicSlide,
  LessonProject,
} from "../model/schema";
import type { StoredMedia } from "../media/model";
import type { LectureRequest } from "./ai";
import { lectureSlots } from "./model";

/** Error codes the server sends (AI_…, VOICE_…, AUTH_…), as an Error message. */
async function post(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    signal?.throwIfAborted();
    throw new Error("AI_NETWORK");
  }
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new Error(
      typeof data.error === "string" ? data.error : "AI_UNAVAILABLE",
    );
  return data;
}

/** What the AI is told about the page: its moments and what each shows. */
export function lectureRequest(
  project: LessonProject,
  slide: BasicSlide,
): LectureRequest {
  const m = project.metadata;
  return {
    lessonTitle: m.projectTitle,
    subject: m.subject,
    grade: m.grade || m.curriculumGrade || m.targetAudienceGrade,
    pageTitle: /^Trang \d+$/.test(slide.title.trim()) ? "" : slide.title,
    notes: slide.teacherNotes.slice(0, 4000),
    slots: lectureSlots(slide).map((s) => ({
      step: s.step,
      label: s.label,
      texts: s.texts.map((t) => t.slice(0, 1500)).slice(0, 80),
      pictures: s.pictures,
    })),
  };
}

/** "AI viết lời giảng": one piece of text per moment of the page. */
export async function writeLecture(
  project: LessonProject,
  slide: BasicSlide,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  const data = await post(
    fetcher,
    "/api/lesson-ai/studio/lecture",
    lectureRequest(project, slide),
    signal,
  );
  const pieces = Array.isArray(data.pieces) ? data.pieces : [];
  return pieces.map((p) => (typeof p === "string" ? p : ""));
}

export interface ClipStore {
  put(value: StoredMedia): Promise<void>;
}
/** Keeps a spoken piece with the lesson; returns its asset for project.assets. */
export async function keepClip(
  project: LessonProject,
  blob: Blob,
  label: string,
  store: ClipStore,
  teacher: boolean,
): Promise<AssetReference> {
  const id = `lecture-${crypto.randomUUID()}`;
  const mimeType = blob.type.split(";")[0] || "audio/webm";
  const name = `${teacher ? "Giọng thầy cô" : "Giọng AI"} – ${label}`.slice(
    0,
    200,
  );
  await store.put({
    assetId: id,
    projectId: project.projectId,
    blob,
    mimeType,
    size: blob.size,
    source: {
      title: name,
      provider: teacher ? "UPLOAD" : "VOICE",
      sourceUrl: "",
      creator: "",
      license: "",
      licenseUrl: "",
      attribution: "",
    },
  });
  return {
    id,
    kind: "AUDIO",
    sourceType: teacher ? "UPLOAD" : "GENERATED",
    name,
    fileName: "",
    mimeType,
    size: blob.size,
    url: `local-media:${id}`,
    altText: label,
    status: "LOCAL",
  };
}

export const voiceMessages: Record<string, string> = {
  VOICE_FAILED: "Chưa lưu được bản ghi âm. Hãy thử lại.",
};
