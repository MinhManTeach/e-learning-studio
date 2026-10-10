import type { Slide } from "../model/schema";

type Question = Extract<Slide, { type: "quiz" }>["data"]["questions"][number];

/** Ends each piece with a stop so the voice pauses between them. */
function sentence(s: string | undefined | null) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
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
const titleOf = (s: Slide) => (/^Trang \d+$/.test(s.title.trim()) ? "" : s.title);

/** A quiz question with its choices, the way a teacher would read it out. */
export function questionSpeech(q: Question, index: number) {
  return joinSpeech([
    `Câu ${index + 1}. ${q.prompt}`,
    ...q.options.map((o) => o.text),
  ]);
}

/**
 * What "Đọc bài" reads for a page: the teacher's narration when there is one,
 * otherwise the words the child sees on the page, in order.
 */
export function pageSpeech(slide: Slide): string {
  const own = slide.narration.text.trim() || slide.voiceScript.trim();
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
      return joinSpeech([
        title,
        slide.data.question,
        slide.data.instruction,
        ...slide.data.items.map((i) => i.label),
      ]);
    case "scenario":
      return joinSpeech([
        title,
        slide.data.situation,
        slide.data.question,
        ...slide.data.choices.map((c) => `${c.label}. ${c.text}`),
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
        slide.data.keyTakeaway &&
          "Em cần nhớ: " +
            slide.data.keyTakeaway.replace(/^\s*em cần nhớ\s*:?\s*/i, ""),
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
