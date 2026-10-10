// One shared reader for the whole lesson: starting a new reading stops the old
// one, and every "Nghe" button can show whether it is the one speaking.
import { normalizeSpeech, voiceKey } from "./readAloud";

export interface VoiceLike {
  lang: string;
  name: string;
}
/**
 * The best voice for the language, or undefined when the device has none.
 * Natural/online voices (Edge's HoaiMy, NamMinh) sound far better to children.
 */
export function pickVoice<T extends VoiceLike>(
  voices: readonly T[],
  lang = "vi-VN",
): T | undefined {
  const norm = (l: string) => l.toLowerCase().replace("_", "-");
  const want = norm(lang);
  const base = want.split("-")[0];
  let best: T | undefined;
  let bestScore = -1;
  for (const v of voices) {
    const l = norm(v.lang);
    if (l.split("-")[0] !== base) continue;
    const score =
      (l === want ? 2 : 0) +
      (/natural|online|neural|premium|enhanced/i.test(v.name) ? 4 : 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Some browsers stop a single long utterance after about 15 seconds, so a page
 * is read as a queue of short pieces cut at sentence ends.
 */
export function speechChunks(text: string, max = 180): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…;:]+[.!?…;:]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const s of sentences) {
    if (current && (current + s).length > max) push();
    if (s.length <= max) {
      current += s;
      continue;
    }
    // A very long sentence: cut between words. (No regex lookbehind: older
    // iPads cannot parse it, and that would break the whole player.)
    for (const word of s.trim().split(" ")) {
      if (current && (current + " " + word).length > max) push();
      current += (current ? " " : "") + word;
    }
  }
  push();
  return chunks;
}

export type SpeakResult = "OK" | "STOPPED" | "UNSUPPORTED" | "NO_VOICE";
export const speechNotices: Record<"UNSUPPORTED" | "NO_VOICE", string> = {
  UNSUPPORTED: "Trình duyệt này chưa hỗ trợ đọc bài.",
  // Chrome, Brave and Cốc Cốc on Windows cannot use the Vietnamese voice that
  // Windows installs (only Edge can), so installing it does not help there.
  NO_VOICE:
    "Trình duyệt này chưa đọc được tiếng Việt. Hãy mở bài bằng Microsoft Edge, hoặc nhờ thầy cô bấm “Tạo giọng đọc” khi soạn bài.",
};

type Synth = Pick<SpeechSynthesis, "speak" | "cancel" | "getVoices">;
type UtteranceCtor = new (text: string) => SpeechSynthesisUtterance;
/** The part of an <audio> element a recorded voice needs. */
export interface ClipPlayer {
  play(): Promise<void> | void;
  pause(): void;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}
interface Engine {
  synth: Synth | null;
  Utterance: UtteranceCtor | null;
  /** Plays recorded voice files; absent where there is no <audio>. */
  Audio?: (new (src: string) => ClipPlayer) | null;
}
function browserEngine(): Engine {
  const Audio =
    typeof window !== "undefined" && typeof window.Audio === "function"
      ? (window.Audio as unknown as new (src: string) => ClipPlayer)
      : null;
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return { synth: null, Utterance: null, Audio };
  return {
    synth: window.speechSynthesis,
    Utterance:
      typeof SpeechSynthesisUtterance === "undefined"
        ? null
        : SpeechSynthesisUtterance,
    Audio,
  };
}

// Recorded voice ("Tạo giọng đọc"): text key -> playable URL. Recordings work on
// every computer, while browsers like Chrome cannot use Windows' Vietnamese voice.
let clipUrl: ((key: string) => string | undefined) | null = null;
/** The player hands in its recordings; `null` when the lesson has none. */
export function setVoiceClips(
  lookup: ((key: string) => string | undefined) | null,
) {
  clipUrl = lookup;
  emit();
}
/** URLs of the recordings for every piece, or null if any is missing. */
function recorded(pieces: string[], lang: string) {
  if (!clipUrl || !currentEngine().Audio) return null;
  const urls = pieces.map((p) => clipUrl?.(voiceKey(p, lang)));
  return urls.every((u): u is string => !!u) ? urls : null;
}
let playing: ClipPlayer | null = null;
let engine: Engine | null = null;
const currentEngine = () => (engine ??= browserEngine());
/** Tests swap in a fake engine; `null` goes back to the browser's. */
export function setSpeechEngine(next: Engine | null) {
  engine = next;
  speakingId = null;
  emit();
}
/** Whether this browser can read anything: its own voice or recordings. */
export function speechSupported() {
  const e = currentEngine();
  return (!!e.synth && !!e.Utterance) || (!!clipUrl && !!e.Audio);
}

let speakingId: string | null = null;
let run = 0; // ignores events from readings that were stopped
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setSpeaking = (id: string | null) => {
  speakingId = id;
  emit();
};

export function stopSpeaking() {
  run++;
  currentEngine().synth?.cancel();
  if (playing) {
    playing.onended = playing.onerror = null;
    playing.pause();
    playing = null;
  }
  if (speakingId !== null) setSpeaking(null);
}

/** Plays recordings one after another; a failed file stops the reading. */
function playClips(id: string, urls: string[]) {
  const Audio = currentEngine().Audio!;
  const mine = ++run;
  const next = (i: number) => {
    if (run !== mine) return;
    if (i >= urls.length) {
      playing = null;
      setSpeaking(null);
      return;
    }
    const clip = new Audio(urls[i]);
    playing = clip;
    clip.onended = () => next(i + 1);
    clip.onerror = () => {
      if (run === mine) stopSpeaking();
    };
    // play() rejects when the file cannot be played.
    void Promise.resolve(clip.play()).catch(() => clip.onerror?.());
  };
  setSpeaking(id);
  next(0);
}

/**
 * Reads `text` aloud; pressing the same button again stops it. Pieces are
 * played from the teacher's recordings when every one has been recorded,
 * otherwise read by the browser's own Vietnamese voice.
 */
export function speak(
  id: string,
  text: string | string[],
  lang = "vi-VN",
): SpeakResult {
  const pieces = (Array.isArray(text) ? text : [text])
    .map(normalizeSpeech)
    .filter(Boolean);
  if (speakingId === id) {
    stopSpeaking();
    return "STOPPED";
  }
  const urls = recorded(pieces, lang);
  if (urls && urls.length) {
    stopSpeaking();
    playClips(id, urls);
    return "OK";
  }
  const { synth, Utterance } = currentEngine();
  if (!synth || !Utterance) return clipUrl ? "NO_VOICE" : "UNSUPPORTED";
  stopSpeaking();
  const voices = synth.getVoices();
  const voice = pickVoice(voices, lang);
  // An empty list means the voices have not loaded yet: let the browser choose.
  if (voices.length && !voice) return "NO_VOICE";
  const chunks = speechChunks(pieces.join(" "));
  if (!chunks.length) return "STOPPED";
  const mine = ++run;
  chunks.forEach((chunk, i) => {
    const u = new Utterance(chunk);
    u.lang = lang;
    if (voice) u.voice = voice;
    u.rate = 0.9; // a little slower for young children
    if (i === chunks.length - 1)
      u.onend = () => {
        if (run === mine) setSpeaking(null);
      };
    u.onerror = () => {
      if (run === mine) stopSpeaking();
    };
    synth.speak(u);
  });
  setSpeaking(id);
  return "OK";
}

export function subscribeSpeech(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
/** The id of the reading playing now, or null. */
export const speakingNow = () => speakingId;
