import { useEffect, useRef, useState } from "react";
import { Pause, RotateCcw, Volume2 } from "lucide-react";
import type {
  AssetReference,
  BasicSlide,
  LessonProject,
} from "../model/schema";
import { isDisplayableUrl, useImageResolver } from "../media/imageResolver";
import {
  speak,
  speakingNow,
  stopSpeaking,
  subscribeSpeech,
} from "../player/speech";
import { lectureFor } from "./model";

// Once a student turns the lecture on, the next pages start speaking by
// themselves (a click has already allowed sound in the browser).
let keepListening = false;

/**
 * The page's lecture for the student: each piece is spoken, then the next
 * click of the slide comes by itself and its piece is spoken, to the end.
 * Pieces without a recording are read by the browser's voice.
 */
export function useLecture({
  slide,
  project,
  shown,
  steps,
  setShown,
}: {
  slide: BasicSlide;
  project: LessonProject;
  shown: number;
  steps: number;
  setShown: (n: number) => void;
}) {
  const pieces = lectureFor(slide);
  const urls = useRef(new Map<number, string>());
  const [on, setOn] = useState(false);
  const [finished, setFinished] = useState(false);
  const run = useRef(0); // ignores the end of pieces that were stopped
  const audio = useRef<HTMLAudioElement | null>(null);
  const wait = useRef<number | undefined>(undefined);
  const speechId = `lecture-${slide.id}`;

  const silence = () => {
    run.current++;
    window.clearTimeout(wait.current);
    if (audio.current) {
      audio.current.onended = audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    if (speakingNow() === speechId) stopSpeaking();
  };
  // Leaving the page stops it.
  useEffect(() => silence, [slide.id]);

  function play(i: number) {
    silence();
    const mine = run.current;
    const after = () => {
      if (run.current !== mine) return;
      if (i < steps) {
        setShown(i + 1);
        play(i + 1);
      } else {
        setOn(false);
        setFinished(true);
      }
    };
    const piece = pieces[i];
    const url = urls.current.get(i);
    if (url) {
      const clip = new Audio(url);
      audio.current = clip;
      clip.onended = after;
      clip.onerror = after;
      void clip.play().catch(after);
      return;
    }
    const text = piece?.text.trim();
    if (!text || speak(speechId, text) !== "OK") {
      // Nothing to say (or no voice): a short pause, then the next click.
      wait.current = window.setTimeout(after, 800);
      return;
    }
    const unsubscribe = subscribeSpeech(() => {
      if (speakingNow() === speechId) return;
      unsubscribe();
      after();
    });
  }

  const start = () => {
    keepListening = true;
    setFinished(false);
    setOn(true);
    play(shown);
  };
  const pause = () => {
    keepListening = false;
    setOn(false);
    silence();
  };
  const again = () => {
    setShown(0);
    keepListening = true;
    setFinished(false);
    setOn(true);
    play(0);
  };
  /** The student clicked "Tiếp theo": the next piece starts at once. */
  const next = (n: number) => {
    if (on) play(n);
  };
  // A page opened after the lecture was turned on starts by itself.
  useEffect(() => {
    if (keepListening && shown === 0) start();
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id]);

  const clips = pieces.flatMap((p, i) => {
    const asset = p.assetId
      ? project.assets.find((a) => a.id === p.assetId && a.kind === "AUDIO")
      : undefined;
    return asset
      ? [
          <ClipUrl
            key={i}
            asset={asset}
            projectId={project.projectId}
            onUrl={(u) => {
              if (u) urls.current.set(i, u);
              else urls.current.delete(i);
            }}
          />,
        ]
      : [];
  });
  const controls = (
    <div className="lecture-controls">
      {clips}
      {on ? (
        <button type="button" onClick={pause} aria-label="Tạm dừng lời giảng">
          <Pause size={16} /> Tạm dừng
        </button>
      ) : finished ? (
        <button type="button" onClick={again}>
          <RotateCcw size={16} /> Nghe lại
        </button>
      ) : (
        <button type="button" onClick={start}>
          <Volume2 size={16} /> Nghe giảng
        </button>
      )}
    </div>
  );
  return { on, next, controls };
}

/** Finds the playable address of one recorded piece. */
function ClipUrl({
  asset,
  projectId,
  onUrl,
}: {
  asset: AssetReference;
  projectId: string;
  onUrl: (url: string) => void;
}) {
  const resolved = useImageResolver()(asset, projectId);
  const url =
    !resolved.loading &&
    !resolved.error &&
    isDisplayableUrl(resolved.url, asset.status === "LOCAL")
      ? resolved.url
      : "";
  useEffect(() => onUrl(url), [url]);
  return null;
}
