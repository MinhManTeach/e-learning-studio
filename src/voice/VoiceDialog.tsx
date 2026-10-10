import { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import "./voice.css";
import type { LessonProject } from "../model/schema";
import type { SpeechPiece } from "../player/readAloud";
import {
  recordMissing,
  voiceCoverage,
  voiceErrorText,
  type VoiceProgress,
  type VoiceStore,
} from "./voiceover";

interface Status {
  available: boolean;
  voice: string;
  reason?: string;
}
type Phase =
  | { step: "checking" }
  | { step: "ready"; total: number; missing: SpeechPiece[] }
  | { step: "working"; progress: VoiceProgress }
  | { step: "done"; total: number };

/**
 * "Tạo giọng đọc": records every sentence the lesson reads aloud with the
 * Windows Vietnamese voice, so the exported lesson speaks in any browser.
 */
export function VoiceDialog({
  project,
  store,
  onClose,
  fetcher = fetch,
}: {
  project: LessonProject;
  store: VoiceStore;
  onClose: () => void;
  fetcher?: typeof fetch;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "checking" });
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  async function check() {
    const { pieces, missing } = await voiceCoverage(project, store);
    setPhase(
      missing.length
        ? { step: "ready", total: pieces.length, missing }
        : { step: "done", total: pieces.length },
    );
  }
  useEffect(() => {
    let live = true;
    fetcher("/api/lesson-ai/voice/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Status) => live && setStatus(s))
      .catch(
        () =>
          live &&
          setStatus({ available: false, voice: "", reason: "VOICE_OFFLINE" }),
      );
    void check();
    return () => {
      live = false;
      abort.current?.abort();
    };
    // Checked once when the dialog opens.
  }, []);
  const working = phase.step === "working";
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working) onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, working]);

  async function record(missing: SpeechPiece[]) {
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      await recordMissing(
        project,
        missing,
        store,
        fetcher,
        (progress) => setPhase({ step: "working", progress }),
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(voiceErrorText(e instanceof Error ? e.message : ""));
    }
    await check();
  }

  const unavailable =
    status && !status.available
      ? voiceErrorText(
          status.reason === "NOT_WINDOWS"
            ? "VOICE_NOT_WINDOWS"
            : status.reason === "NO_VOICE"
              ? "VOICE_MISSING"
              : status.reason === "VOICE_OFFLINE"
                ? "VOICE_OFFLINE"
                : "VOICE_FAILED",
        )
      : "";
  return (
    <div className="modal-overlay">
      <div
        className="modal voice-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Tạo giọng đọc"
      >
        <div className="ai-head">
          <h2>
            <Mic size={22} /> Tạo giọng đọc
          </h2>
          <button aria-label="Đóng" disabled={working} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p>
          Thu sẵn giọng đọc tiếng Việt cho cả bài (lời đọc trang, câu hỏi, yêu
          cầu hoạt động) rồi đóng vào gói SCORM. Học sinh nghe được trên mọi
          trình duyệt — Chrome, Cốc Cốc, Brave, điện thoại — không cần mạng.
        </p>
        {!status || phase.step === "checking" ? (
          <p role="status">Đang kiểm tra…</p>
        ) : phase.step === "done" ? (
          <p className="voice-done" role="status">
            ✓ Đã có giọng đọc cho cả {phase.total} đoạn. Khi sửa chữ trong bài,
            mở lại mục này để thu những đoạn mới.
          </p>
        ) : phase.step === "working" ? (
          <div role="status">
            <p>
              Đang thu giọng {phase.progress.done}/{phase.progress.total} đoạn…
            </p>
            <progress
              max={phase.progress.total}
              value={phase.progress.done}
              aria-label="Tiến độ thu giọng"
            />
          </div>
        ) : unavailable ? (
          <p role="alert">{unavailable}</p>
        ) : (
          <>
            <p>
              Cần thu <strong>{phase.missing.length}</strong> /{" "}
              {phase.total} đoạn bằng giọng{" "}
              <strong>{status.voice || "tiếng Việt của Windows"}</strong>. Miễn
              phí, chạy ngay trên máy này.
            </p>
            <button
              className="primary"
              onClick={() => void record(phase.missing)}
            >
              Thu {phase.missing.length} đoạn
            </button>
          </>
        )}
        {working && (
          <button onClick={() => abort.current?.abort()}>Dừng</button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
