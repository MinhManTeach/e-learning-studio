// One shared reader for the whole lesson: starting a new reading stops the old
// one, and every "Nghe" button can show whether it is the one speaking.

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
  NO_VOICE:
    "Máy này chưa có giọng đọc tiếng Việt. Hãy mở bài bằng Microsoft Edge, hoặc nhờ người lớn thêm giọng Tiếng Việt trong Cài đặt → Thời gian và ngôn ngữ → Giọng nói.",
};

type Synth = Pick<SpeechSynthesis, "speak" | "cancel" | "getVoices">;
type UtteranceCtor = new (text: string) => SpeechSynthesisUtterance;
interface Engine {
  synth: Synth | null;
  Utterance: UtteranceCtor | null;
}
function browserEngine(): Engine {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return { synth: null, Utterance: null };
  return {
    synth: window.speechSynthesis,
    Utterance:
      typeof SpeechSynthesisUtterance === "undefined"
        ? null
        : SpeechSynthesisUtterance,
  };
}
let engine: Engine | null = null;
const currentEngine = () => (engine ??= browserEngine());
/** Tests swap in a fake engine; `null` goes back to the browser's. */
export function setSpeechEngine(next: Engine | null) {
  engine = next;
  speakingId = null;
  emit();
}
export function speechSupported() {
  const e = currentEngine();
  return !!e.synth && !!e.Utterance;
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
  if (speakingId !== null) setSpeaking(null);
}

/** Reads `text` aloud; pressing the same button again stops it. */
export function speak(id: string, text: string, lang = "vi-VN"): SpeakResult {
  const { synth, Utterance } = currentEngine();
  if (!synth || !Utterance) return "UNSUPPORTED";
  if (speakingId === id) {
    stopSpeaking();
    return "STOPPED";
  }
  stopSpeaking();
  const voices = synth.getVoices();
  const voice = pickVoice(voices, lang);
  // An empty list means the voices have not loaded yet: let the browser choose.
  if (voices.length && !voice) return "NO_VOICE";
  const chunks = speechChunks(text);
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
