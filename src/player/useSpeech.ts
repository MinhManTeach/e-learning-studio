import { useEffect, useState } from "react";
import type { Slide } from "../model/schema";

/** Browser text-to-speech for one slide; stops whenever the page changes. */
export function useSpeech(slide: Slide | undefined) {
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    return () => window.speechSynthesis?.cancel();
  }, [slide?.id]);
  function toggle() {
    if (!("speechSynthesis" in window)) {
      setNotice("Trình duyệt này chưa hỗ trợ đọc bài.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!slide) return;
    const utter = new SpeechSynthesisUtterance(
      slide.narration.text || slide.voiceScript || slide.title,
    );
    utter.lang = slide.narration.lang;
    utter.rate = 0.95;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => {
      setSpeaking(false);
      setNotice(
        "Chưa thể đọc bài. Hãy kiểm tra giọng tiếng Việt trên thiết bị.",
      );
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }
  return {
    speaking,
    notice,
    toggle,
    available: !!slide && slide.narration.mode === "BROWSER_TTS",
  };
}
