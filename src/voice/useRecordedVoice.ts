import { useEffect } from "react";
import type { LessonProject } from "../model/schema";
import { lessonSpeechPieces } from "../player/readAloud";
import { setVoiceClips } from "../player/speech";
import { voiceAssetId, type VoiceStore } from "./voiceover";

/**
 * In the editor's preview, plays the recordings made with "Tạo giọng đọc"
 * from this device's media store, like the exported package will.
 */
export function useRecordedVoice(
  project: LessonProject,
  store: Pick<VoiceStore, "get">,
) {
  useEffect(() => {
    let live = true;
    const urls = new Map<string, string>();
    void (async () => {
      for (const piece of lessonSpeechPieces(project)) {
        const stored = await store
          .get(voiceAssetId(piece.key), project.projectId)
          .catch(() => undefined);
        if (!live) return;
        if (stored) urls.set(piece.key, URL.createObjectURL(stored.blob));
      }
      if (live && urls.size) setVoiceClips((key) => urls.get(key));
    })();
    return () => {
      live = false;
      setVoiceClips(null);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [project, store]);
}
