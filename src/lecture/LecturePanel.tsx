import { useEffect, useRef, useState } from "react";
import { Mic, Play, Sparkles, Square, Trash2, Volume2 } from "lucide-react";
import type {
  AssetReference,
  BasicSlide,
  LecturePiece,
  LessonProject,
} from "../model/schema";
import { isDisplayableUrl, useImageResolver } from "../media/imageResolver";
import { explain } from "../ai/AiStudio";
import {
  keepClip,
  voiceAvailable,
  voiceLecture,
  voiceMessages,
  writeLecture,
  type ClipStore,
} from "./client";
import { lectureFor, lectureSlots, slotSummary, voiceOutdated } from "./model";
import "./lecture.css";

const errorText = (code: string) => voiceMessages[code] ?? explain(code);

/**
 * "Lời giảng" of a page in the editor: one piece per moment of the slide
 * (opening, then each click). The AI writes it, the AI voice or the teacher's
 * own microphone speaks it, and the student's page follows it by itself.
 */
export function LecturePanel({
  project,
  slide,
  store,
  onChange,
  fetcher = fetch,
}: {
  project: LessonProject;
  slide: BasicSlide;
  store: ClipStore;
  /** The page with its new lecture, and sound files to add to the lesson. */
  onChange: (slide: BasicSlide, assets?: AssetReference[]) => void;
  fetcher?: typeof fetch;
}) {
  const slots = lectureSlots(slide);
  const pieces = lectureFor(slide);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  // The site may have no AI voice yet; the browser's voice reads instead.
  const [canVoice, setCanVoice] = useState(true);
  useEffect(() => {
    let live = true;
    void voiceAvailable(fetcher).then((ok) => live && setCanVoice(ok));
    return () => {
      live = false;
    };
  }, [fetcher]);

  const save = (next: LecturePiece[], assets?: AssetReference[]) =>
    onChange({ ...slide, data: { ...slide.data, lecture: next } }, assets);
  const change = (i: number, patch: Partial<LecturePiece>) =>
    save(pieces.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function task(label: string, work: (s: AbortSignal) => Promise<void>) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(label);
    setError("");
    try {
      await work(controller.signal);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(errorText(e instanceof Error ? e.message : ""));
    } finally {
      if (abort.current === controller) setBusy("");
    }
  }

  const write = () => {
    const written = pieces.some((p) => p.text.trim());
    if (
      written &&
      !window.confirm(
        "AI sẽ viết lại toàn bộ lời giảng của trang này. Thầy cô vẫn hoàn tác được. Tiếp tục?",
      )
    )
      return;
    void task("AI đang viết lời giảng…", async (signal) => {
      const texts = await writeLecture(project, slide, fetcher, signal);
      // New words: the old AI voice no longer matches; recordings stay.
      save(pieces.map((p, i) => ({ ...p, text: texts[i] ?? p.text })));
    });
  };

  // Pieces with words but no voice yet (or an AI voice of older words).
  const toVoice = pieces
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) =>
        p.text.trim() &&
        p.voice !== "TEACHER" &&
        (!p.assetId || voiceOutdated(p)),
    );
  const voice = () =>
    void task("Đang tạo giọng đọc AI…", async (signal) => {
      const blobs = await voiceLecture(
        toVoice.map(({ p }) => p.text.trim()),
        fetcher,
        signal,
      );
      const assets: AssetReference[] = [];
      const next = [...pieces];
      for (const [k, { p, i }] of toVoice.entries()) {
        const asset = await keepClip(
          project,
          blobs[k],
          `${slide.title} – ${slots[i].label}`,
          store,
          false,
        );
        assets.push(asset);
        next[i] = { ...p, assetId: asset.id, voice: "AI", spokenText: p.text };
      }
      save(next, assets);
    });

  const recorded = async (i: number, blob: Blob) => {
    const asset = await keepClip(
      project,
      blob,
      `${slide.title} – ${slots[i].label}`,
      store,
      true,
    );
    save(
      pieces.map((p, j) =>
        j === i
          ? { ...p, assetId: asset.id, voice: "TEACHER", spokenText: p.text }
          : p,
      ),
      [asset],
    );
  };

  return (
    <section className="lecture-panel" aria-labelledby="lecture-title">
      <div className="lecture-head">
        <div>
          <h3 id="lecture-title">
            <Volume2 size={18} /> Lời giảng của trang
          </h3>
          <p>
            Khi học sinh bấm “Nghe giảng”, bài đọc từng đoạn và tự hiện lần bấm
            tiếp theo khi đọc xong. Không cần căn thời gian.
          </p>
        </div>
        <div className="lecture-actions">
          <button type="button" disabled={!!busy} onClick={write}>
            <Sparkles size={16} /> AI viết lời giảng
          </button>
          {canVoice && (
            <button
              type="button"
              disabled={!!busy || !toVoice.length}
              onClick={voice}
              title={
                toVoice.length
                  ? `Tạo giọng AI cho ${toVoice.length} đoạn`
                  : "Mọi đoạn có chữ đều đã có tiếng"
              }
            >
              <Volume2 size={16} /> Tạo giọng AI
              {toVoice.length ? ` (${toVoice.length})` : ""}
            </button>
          )}
        </div>
      </div>
      {busy && (
        <p className="lecture-busy" role="status">
          {busy}{" "}
          <button type="button" onClick={() => abort.current?.abort()}>
            Dừng
          </button>
        </p>
      )}
      {error && (
        <p className="lecture-error" role="alert">
          {error}
        </p>
      )}
      <ol className="lecture-pieces">
        {slots.map((slot, i) => (
          <PieceRow
            key={slot.step}
            label={slot.label}
            summary={slotSummary(slot)}
            piece={pieces[i]}
            project={project}
            disabled={!!busy}
            onText={(text) => change(i, { text })}
            onRecorded={(blob) =>
              void task("Đang lưu bản ghi âm…", () => recorded(i, blob))
            }
            onRemoveVoice={() =>
              change(i, {
                assetId: undefined,
                voice: undefined,
                spokenText: undefined,
              })
            }
            onError={setError}
          />
        ))}
      </ol>
    </section>
  );
}

function PieceRow({
  label,
  summary,
  piece,
  project,
  disabled,
  onText,
  onRecorded,
  onRemoveVoice,
  onError,
}: {
  label: string;
  summary: string;
  piece: LecturePiece;
  project: LessonProject;
  disabled: boolean;
  onText: (text: string) => void;
  onRecorded: (blob: Blob) => void;
  onRemoveVoice: () => void;
  onError: (message: string) => void;
}) {
  const asset = piece.assetId
    ? project.assets.find((a) => a.id === piece.assetId)
    : undefined;
  const resolved = useImageResolver()(asset, project.projectId);
  const url =
    asset && !resolved.loading && !resolved.error
      ? isDisplayableUrl(resolved.url, asset.status === "LOCAL")
        ? resolved.url
        : ""
      : "";
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const recorder = useRecorder(onRecorded, onError);
  useEffect(() => () => player.current?.pause(), []);

  const listen = () => {
    if (playing) {
      player.current?.pause();
      setPlaying(false);
      return;
    }
    const clip = new Audio(url);
    player.current = clip;
    clip.onended = clip.onerror = () => setPlaying(false);
    setPlaying(true);
    void clip.play().catch(() => setPlaying(false));
  };
  const status = !piece.assetId
    ? piece.text.trim()
      ? "Chưa có tiếng"
      : ""
    : voiceOutdated(piece)
      ? "Lời đã sửa, cần tạo lại giọng"
      : piece.voice === "TEACHER"
        ? "Giọng thầy cô"
        : "Giọng AI";
  return (
    <li className="lecture-piece">
      <div className="lecture-piece-head">
        <strong>{label}</strong>
        <span className="lecture-summary">{summary}</span>
      </div>
      <textarea
        aria-label={`Lời giảng – ${label}`}
        value={piece.text}
        rows={3}
        placeholder="Lời thầy cô nói ở thời điểm này…"
        onChange={(e) => onText(e.target.value)}
      />
      <div className="lecture-piece-tools">
        {recorder.recording ? (
          <button type="button" className="recording" onClick={recorder.stop}>
            <Square size={14} /> Dừng ghi ({recorder.seconds}s)
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={recorder.start}
            title="Ghi âm giọng thầy cô bằng micro"
          >
            <Mic size={14} /> Ghi âm
          </button>
        )}
        <button type="button" disabled={!url} onClick={listen}>
          {playing ? <Square size={14} /> : <Play size={14} />}{" "}
          {playing ? "Dừng" : "Nghe"}
        </button>
        {piece.assetId && (
          <button
            type="button"
            className="danger-text"
            disabled={disabled}
            onClick={onRemoveVoice}
          >
            <Trash2 size={14} /> Xoá tiếng
          </button>
        )}
        {status && (
          <span
            className={
              "lecture-status" + (voiceOutdated(piece) ? " outdated" : "")
            }
          >
            {status}
          </span>
        )}
      </div>
    </li>
  );
}

/** Records the microphone until stopped; hands over the sound file. */
function useRecorder(
  onDone: (blob: Blob) => void,
  onError: (message: string) => void,
) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stopTracks = () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    window.clearInterval(timer.current);
  };
  useEffect(
    () => () => {
      if (rec.current?.state === "recording") {
        rec.current.ondataavailable = null;
        rec.current.onstop = null;
        rec.current.stop();
      }
      stopTracks();
    },
    [],
  );
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError("Trình duyệt này chưa ghi âm được. Hãy dùng Chrome hoặc Edge.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError(
        "Chưa dùng được micro. Hãy cho phép trình duyệt dùng micro (biểu tượng ổ khoá cạnh địa chỉ trang) rồi thử lại.",
      );
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stopTracks();
      setRecording(false);
      const blob = new Blob(chunks, {
        type: (r.mimeType || "audio/webm").split(";")[0],
      });
      if (blob.size) onDone(blob);
    };
    r.start();
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stop = () => {
    if (rec.current?.state === "recording") rec.current.stop();
  };
  return {
    recording,
    seconds,
    start: () => void start(),
    stop,
  };
}
