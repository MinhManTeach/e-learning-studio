// Turns a parsed PowerPoint into proposed lesson pages. Every decision is a
// suggestion the teacher reviews before a lesson is created.
import type { PptxDeck, PptxElement, PptxSlide, Rect } from "./parse";

export interface DraftOption {
  text: string;
  /** Picture shown on the answer card (zip path). */
  image?: string;
}
export interface DraftQuestion {
  prompt: string;
  options: DraftOption[];
  /** Indexes of options PowerPoint marks as correct (by sound or by link). */
  correct: number[];
  explanation: string;
  /** How the correct answer was found, for the review screen. */
  evidence: "LINKS" | "SOUNDS" | "NONE";
}
export type DraftPage =
  | {
      kind: "PAGE";
      slide: number;
      title: string;
      text: string[];
      notes: string[];
      /** Biggest meaningful picture on the slide, used when no slide image is given. */
      picture?: string;
    }
  | {
      kind: "VIDEO";
      slide: number;
      title: string;
      video: string;
      notes: string[];
    }
  | {
      kind: "QUESTIONS";
      slide: number;
      title: string;
      questions: DraftQuestion[];
    };
export interface SkippedSlide {
  slide: number;
  reason: string;
}
export interface DeckAnalysis {
  pages: DraftPage[];
  skipped: SkippedSlide[];
  /** Media the proposed pages use (zip paths). */
  media: string[];
}

/** "Notebook.LM", "NotebookL.M", "NotebookİM", "@NotebookL.M", "Notebook<LM"… */
export function isWatermark(text: string) {
  const letters = text
    .replace(/[İı]/g, "i")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return /^notebook[a-z]{0,3}m$/.test(letters);
}
/** Blanks for the teacher to fill in by hand ("Giáo viên: ........"). */
const isBlank = (t: string) => /(\.{4,}|…{2,})/.test(t);
const cleanText = (lines: string[]) =>
  lines.filter(
    (t) => !isWatermark(t) && !isBlank(t) && t.replace(/\W/g, "").length > 1,
  );

const correctSound =
  /(^|[^a-z])(dung|đúng|correct|right|chinh ?xac|chính ?xác|vo ?tay|vỗ ?tay|hoan ?ho|hoan ?hô|yeah|tada)/i;
const wrongSound = /(^|[^a-z])(sai|wrong|incorrect|tiec|tiếc|buzz|loi|lỗi)/i;
const correctFeedback = /CHÍNH XÁC|ĐÚNG RỒI|GIỎI LẮM|TUYỆT VỜI|CORRECT/i;
const wrongFeedback = /CHƯA ĐÚNG|SAI RỒI|TIẾC QUÁ|THỬ LẠI|WRONG/i;

const area = (r: Rect | undefined, deck: PptxDeck) =>
  r ? (r.w * r.h) / (deck.width * deck.height) : 0;
const onSlide = (r: Rect | undefined, deck: PptxDeck) =>
  !!r &&
  r.x < deck.width &&
  r.y < deck.height &&
  r.x + r.w > 0 &&
  r.y + r.h > 0;
const centerY = (r?: Rect) => (r ? r.y + r.h / 2 : 0);
const centerX = (r?: Rect) => (r ? r.x + r.w / 2 : 0);
/** "A." "b)" "(C)" at the start of an answer; a bare letter needs punctuation. */
const optionLetter = /^\(?[A-Da-d][.):]\s*/;
const onlyLetter = /^\(?[A-Da-d][.):]?$/;
const stripLetter = (t: string) => t.replace(optionLetter, "").trim();
const isPrompt = (t: string) =>
  /\?\s*$|:\s*$/.test(t) || /^(Câu\s*\d+|\d+\s*[.)])\s*\S/i.test(t);

function slideTitle(slide: PptxSlide, deck: PptxDeck) {
  const texts = slide.elements.filter(
    (e) => onSlide(e.rect, deck) && cleanText(e.text).length,
  );
  const placeholder = texts.find(
    (e) => e.placeholder === "title" || e.placeholder === "ctrTitle",
  );
  if (placeholder) return cleanText(placeholder.text).join(" ");
  // Otherwise the top-most text near the top of the slide.
  const top = [...texts].sort((a, b) => centerY(a.rect) - centerY(b.rect))[0];
  return top ? cleanText(top.text).join(" ").slice(0, 160) : "";
}
function slideText(slide: PptxSlide, deck: PptxDeck, title: string) {
  return slide.elements
    .filter((e) => onSlide(e.rect, deck) && !e.jump)
    .sort(
      (a, b) =>
        centerY(a.rect) - centerY(b.rect) || centerX(a.rect) - centerX(b.rect),
    )
    .flatMap((e) => cleanText(e.text))
    .filter((t) => t !== title);
}
/** Largest picture that is neither the background nor a small decoration. */
function mainPicture(slide: PptxSlide, deck: PptxDeck) {
  return slide.elements
    .filter((e) => e.image && !e.media && onSlide(e.rect, deck))
    .map((e) => ({ e, a: area(e.rect, deck) }))
    .filter(({ a }) => a > 0.04 && a < 0.85)
    .sort((x, y) => y.a - x.a)[0]?.e.image;
}

interface Choice {
  element: PptxElement;
  correct: boolean | undefined;
}
/** Text of an answer: its own text, or the text on the same row when it is only "A". */
function answerText(choice: PptxElement, slide: PptxSlide, deck: PptxDeck) {
  const own = cleanText(choice.text).join(" ");
  if (own && !onlyLetter.test(own)) return stripLetter(own);
  const row = slide.elements
    .filter(
      (e) =>
        e !== choice &&
        onSlide(e.rect, deck) &&
        cleanText(e.text).length &&
        !onlyLetter.test(cleanText(e.text)[0]) &&
        Math.abs(centerY(e.rect) - centerY(choice.rect)) <
          (choice.rect?.h ?? 0) * 0.8 &&
        centerX(e.rect) > centerX(choice.rect),
    )
    .sort((a, b) => centerX(a.rect) - centerX(b.rect))[0];
  return row ? stripLetter(cleanText(row.text).join(" ")) : own;
}
/** A picture answer (the shape clicked is a picture, or a picture sits just above a letter). */
function answerPicture(choice: PptxElement, slide: PptxSlide, deck: PptxDeck) {
  if (choice.image && !choice.text.length && area(choice.rect, deck) > 0.02)
    return choice.image;
  const c = choice.rect;
  if (!c) return undefined;
  const texts = slide.elements.filter((e) => e.text.length && e.rect);
  // A picture whose box holds some text is a button or panel background.
  const behindText = (r: Rect) =>
    texts.some(
      (t) =>
        centerX(t.rect) > r.x &&
        centerX(t.rect) < r.x + r.w &&
        centerY(t.rect) > r.y &&
        centerY(t.rect) < r.y + r.h,
    );
  const above = slide.elements
    .filter((e): e is PptxElement & { rect: Rect } => {
      const r = e.rect;
      return (
        !!e.image &&
        !e.media &&
        !e.text.length &&
        !!r &&
        area(r, deck) > 0.02 &&
        area(r, deck) < 0.4 &&
        r.y + r.h <= c.y + c.h * 0.5 &&
        c.y - (r.y + r.h) < Math.max(c.h * 1.5, deck.height * 0.05) &&
        Math.abs(centerX(r) - centerX(c)) < r.w * 0.6 &&
        !behindText(r)
      );
    })
    .sort((a, b) => b.rect.y - a.rect.y)[0];
  return above?.image;
}
function groupByPrompt(
  choices: Choice[],
  slide: PptxSlide,
  deck: PptxDeck,
): DraftQuestion[] {
  const prompts = slide.elements
    .filter((e) => onSlide(e.rect, deck) && !e.jump)
    .map((e) => ({ e, text: cleanText(e.text).join(" ") }))
    .filter(({ text }) => text && isPrompt(text))
    .filter(({ e }) => !choices.some((c) => c.element === e))
    .sort((a, b) => centerY(a.e.rect) - centerY(b.e.rect));
  const groups = new Map<number, Choice[]>();
  for (const c of choices) {
    let owner = 0;
    prompts.forEach((p, i) => {
      if (centerY(p.e.rect) < centerY(c.element.rect)) owner = i;
    });
    groups.set(owner, [...(groups.get(owner) ?? []), c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, group]) => {
      // Reading order: left to right, top to bottom.
      group.sort(
        (a, b) =>
          Math.round(centerY(a.element.rect) / (deck.height * 0.06)) -
            Math.round(centerY(b.element.rect) / (deck.height * 0.06)) ||
          centerX(a.element.rect) - centerX(b.element.rect),
      );
      const options = group.map((c) => {
        const image = answerPicture(c.element, slide, deck);
        const text = answerText(c.element, slide, deck);
        return {
          text: text || (image ? "" : "?"),
          ...(image ? { image } : {}),
        };
      });
      const correct = group.flatMap((c, k) => (c.correct ? [k] : []));
      return {
        prompt:
          prompts[i]?.text.replace(/^(Câu\s*\d+\s*[:.]|\d+\s*[.)])\s*/i, "") ??
          "",
        options,
        correct,
        explanation: "",
        evidence: group.some((c) => c.correct !== undefined)
          ? "SOUNDS"
          : "NONE",
      } satisfies DraftQuestion;
    });
}

/** Questions answered by clicking an option that plays a "correct" or "wrong" sound. */
function soundQuestions(slide: PptxSlide, deck: PptxDeck) {
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  const verdict = (e: PptxElement | undefined) => {
    if (e?.media?.kind !== "AUDIO") return undefined;
    const label = `${e.name} ${e.media.path.split("/").at(-1)}`;
    if (wrongSound.test(label)) return false;
    if (correctSound.test(label)) return true;
    return undefined;
  };
  const choices: Choice[] = [];
  for (const t of slide.triggers) {
    const element = byId.get(t.trigger);
    if (!element || element.media) continue;
    const verdicts = t.targets.map((id) => verdict(byId.get(id)));
    if (verdicts.every((v) => v === undefined)) continue;
    choices.push({ element, correct: verdicts.includes(true) });
  }
  return choices.length >= 2 ? groupByPrompt(choices, slide, deck) : [];
}

/** "A. …  B. …" options with nothing in the file saying which is right. */
function plainQuestions(slide: PptxSlide, deck: PptxDeck) {
  const options = slide.elements.filter(
    (e) =>
      onSlide(e.rect, deck) &&
      !e.jump &&
      e.text.length === 1 &&
      /^[A-D][.)]\s*\S/.test(e.text[0]),
  );
  if (options.length < 2) return [];
  const letters = new Set(options.map((o) => o.text[0][0]));
  if (!letters.has("A") || !letters.has("B")) return [];
  return groupByPrompt(
    options.map((element) => ({ element, correct: undefined })),
    slide,
    deck,
  );
}

/** Decided by the slide heading; "CHƯA ĐÚNG RỒI" must not read as "ĐÚNG RỒI". */
function feedbackKind(slide: PptxSlide | undefined, deck: PptxDeck) {
  if (!slide) return undefined;
  const heading = slideTitle(slide, deck);
  if (wrongFeedback.test(heading)) return "WRONG";
  if (correctFeedback.test(heading)) return "CORRECT";
  return undefined;
}
const feedbackNoise =
  /CHÍNH XÁC|ĐÚNG RỒI|GIỎI LẮM|TIẾP TỤC|MENU|TRANG ĐẦU|Robot nhận|Tiến trình|^\d+\/\d+$|^🔊$/i;

/** Game questions: each answer is a button that jumps to a "correct" or "wrong" slide. */
function linkQuestion(slide: PptxSlide, deck: PptxDeck) {
  const kinds = slide.elements
    .filter((e) => e.jump)
    .map((e) => ({ e, kind: feedbackKind(deck.slides[e.jump! - 1], deck) }))
    .filter((x) => x.kind);
  if (kinds.length < 2 || !kinds.some((k) => k.kind === "CORRECT")) return [];
  const [question] = groupByPrompt(
    kinds.map(({ e, kind }) => ({ element: e, correct: kind === "CORRECT" })),
    slide,
    deck,
  );
  if (!question) return [];
  const right = kinds.find((k) => k.kind === "CORRECT")!;
  const feedback = deck.slides[right.e.jump! - 1];
  question.explanation = cleanText(
    feedback.elements
      .filter((e) => !e.jump)
      .sort((a, b) => centerY(a.rect) - centerY(b.rect))
      .flatMap((e) => e.text),
  )
    .filter((t) => !feedbackNoise.test(t.replace(/^[^\p{L}\d]+/u, "")))
    .join(" ")
    .trim();
  question.evidence = "LINKS";
  return [question];
}

export function analyzeDeck(deck: PptxDeck): DeckAnalysis {
  const pages: DraftPage[] = [];
  const skipped: SkippedSlide[] = [];
  const feedbackSlides = new Set<number>();
  for (const s of deck.slides)
    for (const e of s.elements)
      if (e.jump && feedbackKind(deck.slides[e.jump - 1], deck))
        feedbackSlides.add(e.jump);

  for (const slide of deck.slides) {
    const n = slide.number;
    if (slide.hidden) {
      skipped.push({ slide: n, reason: "Slide đang ẩn trong PowerPoint." });
      continue;
    }
    if (feedbackSlides.has(n)) {
      skipped.push({
        slide: n,
        reason:
          "Trang báo đúng/sai của trò chơi; lời giải thích được đưa vào câu hỏi.",
      });
      continue;
    }
    const title = slideTitle(slide, deck);
    const questions = [
      ...linkQuestion(slide, deck),
      ...soundQuestions(slide, deck),
    ];
    if (!questions.length) questions.push(...plainQuestions(slide, deck));
    if (questions.length) {
      pages.push({ kind: "QUESTIONS", slide: n, title, questions });
      continue;
    }
    const jumps = slide.elements.filter((e) => e.jump).length;
    if (jumps >= 3) {
      skipped.push({
        slide: n,
        reason: "Trang điều hướng (menu) của trò chơi trong PowerPoint.",
      });
      continue;
    }
    const video = slide.elements
      .filter((e) => e.media?.kind === "VIDEO" && area(e.rect, deck) > 0.15)
      .sort((a, b) => area(b.rect, deck) - area(a.rect, deck))[0];
    if (video?.media) {
      pages.push({
        kind: "VIDEO",
        slide: n,
        title: title || "Video",
        video: video.media.path,
        notes: slide.notes,
      });
      continue;
    }
    pages.push({
      kind: "PAGE",
      slide: n,
      title: title || `Trang ${n}`,
      text: slideText(slide, deck, title),
      notes: slide.notes,
      picture: mainPicture(slide, deck),
    });
  }
  const media = new Set<string>();
  for (const p of pages) {
    if (p.kind === "VIDEO") media.add(p.video);
    if (p.kind === "PAGE" && p.picture) media.add(p.picture);
    if (p.kind === "QUESTIONS")
      for (const q of p.questions)
        for (const o of q.options) if (o.image) media.add(o.image);
  }
  return { pages, skipped, media: [...media] };
}
