import { useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { speak, speechNotices, speechSupported } from "./speech";
import { useSpeaking } from "./useSpeaking";

/**
 * A small "listen" button beside a question or instruction, for children who
 * cannot read it on their own yet. Hidden where the browser cannot speak.
 */
export function SpeakButton({
  id,
  text,
  label,
  lang = "vi-VN",
}: {
  id: string;
  text: string;
  /** What is read, for screen readers: "câu 1", "yêu cầu"… */
  label: string;
  lang?: string;
}) {
  const speaking = useSpeaking(id);
  const [notice, setNotice] = useState("");
  if (!text.trim() || !speechSupported()) return null;
  return (
    <span className="speak-wrap">
      <button
        type="button"
        className="speak-button"
        aria-label={(speaking ? "Dừng đọc " : "Nghe đọc ") + label}
        aria-pressed={speaking}
        onClick={(e) => {
          e.stopPropagation();
          const r = speak(id, text, lang);
          setNotice(
            r === "NO_VOICE" || r === "UNSUPPORTED" ? speechNotices[r] : "",
          );
        }}
      >
        {speaking ? <Square size={14} /> : <Volume2 size={16} />}
      </button>
      {notice && (
        <span className="speak-notice" role="status">
          {notice}
        </span>
      )}
    </span>
  );
}
