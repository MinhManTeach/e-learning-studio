import type { LessonProject, Slide } from "../model/schema";

// Everything the lesson reads aloud is built here, so the editor can record
// exactly the same sentences ahead of time ("Tạo giọng đọc") and the player can
// find each recording again by its text.

type Question = Extract<Slide, { type: "quiz" }>["data"]["questions"][number];
type Of<T extends Slide["type"]> = Extract<Slide, { type: T }>;

/** One space between words, nothing around: the form recordings are keyed by. */
export const normalizeSpeech = (s: string) => s.replace(/\s+/g, " ").trim();

/** Ends each piece with a stop so the voice pauses between them. */
function sentence(s: string | undefined | null) {
  const t = normalizeSpeech(s ?? "");
  if (!t) return "";
  return /[.!?…:;]$/.test(t) ? t : t + ".";
}
export function joinSpeech(parts: (string | undefined | null | false)[]) {
  return parts
    .map((p) => (p ? sentence(p) : ""))
    .filter(Boolean)
    .join(" ");
}
// "Trang 3" is a placeholder name from a PowerPoint import, not worth reading.
const titleOf = (s: Slide) =>
  /^Trang \d+$/.test(s.title.trim()) ? "" : s.title;

/**
 * A quiz question read in pieces: number, question, then each choice. Choices
 * may be shuffled on screen, so each piece is recorded on its own and played in
 * the order the child sees.
 */
export function questionPieces(q: Question, index: number): string[] {
  return [
    `Câu ${index + 1}.`,
    sentence(q.prompt),
    ...q.options.map((o) => sentence(o.text)),
  ].filter(Boolean);
}
/** A quiz question with its choices, the way a teacher would read it out. */
export const questionSpeech = (q: Question, index: number) =>
  questionPieces(q, index).join(" ");

export const warmupSpeech = (s: Of<"warmup">) =>
  joinSpeech([
    s.data.question,
    s.data.instruction,
    ...s.data.items.map((i) => i.label),
  ]);
export const situationSpeech = (s: Of<"scenario">) =>
  normalizeSpeech(s.data.situation);
export const decisionSpeech = (s: Of<"scenario">) =>
  joinSpeech([
    s.data.question,
    ...s.data.choices.map((c) => `${c.label}. ${c.text}`),
  ]);
export const activitySpeech = (s: Of<"activity">) =>
  normalizeSpeech(s.data.instruction);
/** "Em cần nhớ: …" without saying "Em cần nhớ" twice. */
export const rememberText = (keyTakeaway: string) =>
  keyTakeaway.replace(/^\s*em cần nhớ\s*:?\s*/i, "");
export const rememberSpeech = (keyTakeaway: string) =>
  normalizeSpeech("Em cần nhớ: " + rememberText(keyTakeaway));

/**
 * What "Đọc bài" reads for a page: the teacher's narration when there is one,
 * otherwise the words the child sees on the page, in order.
 */
export function pageSpeech(slide: Slide): string {
  const own = normalizeSpeech(slide.narration.text || slide.voiceScript);
  if (own) return own;
  const title = titleOf(slide);
  switch (slide.type) {
    case "welcome":
    case "content":
      return joinSpeech([
        title,
        slide.subtitle,
        slide.data.body,
        ...slide.data.paragraphs,
        ...slide.data.bulletPoints,
        slide.data.keyTakeaway,
      ]);
    case "objectives":
      return joinSpeech([
        title,
        ...slide.data.learningOutcomes,
        ...slide.data.keyMessages,
      ]);
    case "warmup":
      return joinSpeech([title, warmupSpeech(slide)]);
    case "scenario":
      return joinSpeech([
        title,
        slide.data.situation,
        decisionSpeech(slide),
      ]);
    case "quiz":
      return joinSpeech([
        title,
        slide.data.instructions,
        ...slide.data.questions.map((q, i) => `Câu ${i + 1}. ${q.prompt}`),
      ]);
    case "summary":
      return joinSpeech([
        title,
        ...slide.data.keyMessages,
        ...slide.data.safetyTips,
      ]);
    case "cards":
      return joinSpeech([
        title,
        slide.data.intro,
        slide.data.style === "MINDMAP" && slide.data.center,
        ...slide.data.items.map((i) => joinSpeech([i.title, i.text])),
        slide.data.keyTakeaway && rememberSpeech(slide.data.keyTakeaway),
      ]);
    case "activity":
      return joinSpeech([title, slide.data.instruction]);
    case "completion":
      return joinSpeech([title, slide.data.message]);
    default:
      return joinSpeech([title]);
  }
}

/** Teachers can switch reading off for a page; the item buttons follow that. */
export const canReadAloud = (slide: Slide) => slide.narration.mode !== "NONE";

/** One sentence (or narration) the lesson can read, in its language. */
export interface SpeechPiece {
  text: string;
  lang: string;
  key: string;
}
/**
 * Every piece of text the lesson can read aloud, once each, in lesson order:
 * what "Tạo giọng đọc" records and what the package carries.
 */
export function lessonSpeechPieces(project: LessonProject): SpeechPiece[] {
  const out = new Map<string, SpeechPiece>();
  for (const s of project.slides) {
    const lang = s.narration.lang;
    const add = (t: string) => {
      const text = normalizeSpeech(t);
      const key = voiceKey(text, lang);
      if (text && !out.has(key)) out.set(key, { text, lang, key });
    };
    if (s.narration.mode === "BROWSER_TTS") add(pageSpeech(s));
    if (!canReadAloud(s)) continue;
    if (s.type === "warmup") add(warmupSpeech(s));
    if (s.type === "scenario") {
      add(situationSpeech(s));
      add(decisionSpeech(s));
    }
    if (s.type === "quiz")
      s.data.questions.forEach((q, i) => questionPieces(q, i).forEach(add));
    if (s.type === "activity") add(activitySpeech(s));
    if (s.type === "cards" && s.data.keyTakeaway)
      add(rememberSpeech(s.data.keyTakeaway));
  }
  return [...out.values()];
}

/**
 * Short, stable name for a recording of `text` in `lang` (two 32-bit FNV-1a
 * hashes). Editing the text gives a new name, so an old recording is never
 * played for new words.
 */
export function voiceKey(text: string, lang = "vi-VN") {
  const input = lang + "|" + normalizeSpeech(text);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
