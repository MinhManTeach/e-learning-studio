import { useEffect, useState } from "react";
import type { Slide } from "../model/schema";
import { pageSpeech } from "./readAloud";
import { speak, speechNotices, stopSpeaking } from "./speech";
import { useSpeaking } from "./useSpeaking";

/** "Đọc bài" for one page; reading stops whenever the page changes. */
export function useSpeech(slide: Slide | undefined) {
  const id = "page:" + (slide?.id ?? "");
  const speaking = useSpeaking(id);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    stopSpeaking();
    setNotice("");
    return () => stopSpeaking();
  }, [slide?.id]);
  function toggle() {
    if (!slide) return;
    const r = speak(id, pageSpeech(slide), slide.narration.lang);
    setNotice(
      r === "NO_VOICE" || r === "UNSUPPORTED" ? speechNotices[r] : "",
    );
  }
  return {
    speaking,
    notice,
    toggle,
    available: !!slide && slide.narration.mode === "BROWSER_TTS",
  };
}
