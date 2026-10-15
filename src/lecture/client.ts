// The editor's side of "Lời giảng": asks the AI to write it, asks the server
// to speak it, and keeps every spoken piece with the lesson as an AUDIO asset.
import type {
  AssetReference,
  BasicSlide,
  LessonProject,
} from "../model/schema";
import type { StoredMedia } from "../media/model";
import { detectSoundMime } from "../media/storage";
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

function bytesOf(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Whether the server can make an AI voice. Only a clear "no" hides it: the
 * desktop app answers nothing here and uses the Windows voice.
 */
export async function voiceAvailable(
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetcher("/api/lesson-ai/lecture/voice");
    if (!res.ok) return true;
    const data = (await res.json()) as { available?: unknown };
    return data.available !== false;
  } catch {
    return true;
  }
}

/** The AI voice reading each text: one sound file per text. */
export async function voiceLecture(
  texts: string[],
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Blob[]> {
  const data = await post(
    fetcher,
    "/api/lesson-ai/lecture/voice",
    { texts },
    signal,
  );
  const clips = Array.isArray(data.clips) ? data.clips : [];
  if (clips.length !== texts.length) throw new Error("VOICE_FAILED");
  return clips.map((clip) => {
    const bytes = bytesOf(String(clip));
    const type = detectSoundMime(bytes);
    if (!type) throw new Error("VOICE_FAILED");
    return new Blob([bytes], { type });
  });
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
  VOICE_UNAVAILABLE:
    "Máy chủ chưa có giọng đọc AI (thiếu khoá GOOGLE_TTS_API_KEY). Thầy cô có thể tự ghi âm.",
  VOICE_BUSY: "Giọng đọc AI đang bận. Đợi khoảng một phút rồi thử lại.",
  VOICE_INPUT: "Có đoạn lời giảng trống hoặc quá dài.",
  VOICE_FAILED: "Chưa tạo được giọng đọc. Hãy thử lại.",
  VOICE_NOT_WINDOWS:
    "Chỉ tạo được giọng đọc khi chạy ứng dụng trên máy Windows có giọng tiếng Việt.",
  VOICE_MISSING:
    "Máy chưa có giọng tiếng Việt của Windows. Vào Cài đặt → Thời gian và ngôn ngữ → Ngôn ngữ, thêm Tiếng Việt.",
};
