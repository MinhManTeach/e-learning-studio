import type { LessonProject } from "../model/schema";
import type { StoredMedia } from "../media/model";
import { lessonSpeechPieces, type SpeechPiece } from "../player/readAloud";

// "Tạo giọng đọc": the editor records every sentence the lesson reads aloud
// (on the teacher's Windows computer, see server/windowsVoice.ts) and keeps the
// M4A files with the lesson's pictures. The package then plays them instead of
// the browser's own voice, which Chrome/Brave/Cốc Cốc lack for Vietnamese.

export interface VoiceStore {
  get(assetId: string, projectId: string): Promise<StoredMedia | undefined>;
  put(value: StoredMedia): Promise<void>;
}
/** Recordings live in the media store under their text key. */
export const voiceAssetId = (key: string) => "voice-" + key;

export interface VoiceProgress {
  done: number;
  total: number;
}
/** Which pieces already have a recording on this device. */
export async function voiceCoverage(project: LessonProject, store: VoiceStore) {
  const pieces = lessonSpeechPieces(project);
  const present = await Promise.all(
    pieces.map(
      async (p) =>
        !!(await store
          .get(voiceAssetId(p.key), project.projectId)
          .catch(() => undefined)),
    ),
  );
  return {
    pieces,
    missing: pieces.filter((_, i) => !present[i]),
    recorded: present.filter(Boolean).length,
  };
}

const batchSize = 40;
function base64Bytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Records the missing pieces in batches and stores each file as it arrives, so
 * stopping half way keeps what was done. Throws an error code (VOICE_…/AI_…).
 */
export async function recordMissing(
  project: LessonProject,
  missing: SpeechPiece[],
  store: VoiceStore,
  fetcher: typeof fetch,
  onProgress: (p: VoiceProgress) => void = () => {},
  signal?: AbortSignal,
) {
  let done = 0;
  onProgress({ done, total: missing.length });
  // One request per language and batch.
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const groups = new Map<string, SpeechPiece[]>();
    for (const p of batch)
      groups.set(p.lang, [...(groups.get(p.lang) ?? []), p]);
    for (const [lang, pieces] of groups) {
      let response: Response;
      try {
        response = await fetcher("/api/lesson-ai/voice/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, texts: pieces.map((p) => p.text) }),
          signal,
        });
      } catch {
        signal?.throwIfAborted();
        throw new Error("VOICE_OFFLINE");
      }
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        clips?: unknown;
      };
      if (!response.ok) throw new Error(body.error || "VOICE_FAILED");
      const clips = Array.isArray(body.clips) ? body.clips : [];
      if (clips.length !== pieces.length) throw new Error("VOICE_FAILED");
      for (let i = 0; i < pieces.length; i++) {
        const bytes = base64Bytes(String(clips[i]));
        const blob = new Blob([bytes], { type: "audio/mp4" });
        await store.put({
          assetId: voiceAssetId(pieces[i].key),
          projectId: project.projectId,
          blob,
          mimeType: "audio/mp4",
          size: blob.size,
          source: {
            title: pieces[i].text.slice(0, 200),
            provider: "VOICE",
            sourceUrl: "",
            creator: "",
            license: "",
            licenseUrl: "",
            attribution: "",
          },
        });
        onProgress({ done: ++done, total: missing.length });
      }
    }
  }
}

export const voiceErrors: Record<string, string> = {
  VOICE_NOT_WINDOWS:
    "Chỉ tạo được giọng đọc khi chạy ứng dụng trên máy Windows có giọng tiếng Việt.",
  VOICE_MISSING:
    "Máy chưa có giọng tiếng Việt của Windows. Vào Cài đặt → Thời gian và ngôn ngữ → Ngôn ngữ, thêm Tiếng Việt (có Chuyển văn bản thành giọng nói).",
  VOICE_OFFLINE:
    "Không kết nối được tới ứng dụng trên máy. Hãy kiểm tra cửa sổ chạy ứng dụng còn mở.",
  VOICE_INPUT: "Có đoạn văn bản không hợp lệ để đọc.",
  VOICE_FAILED: "Windows chưa tạo được giọng đọc. Hãy thử lại.",
};
export const voiceErrorText = (code: string) =>
  voiceErrors[code] ?? voiceErrors.VOICE_FAILED;
