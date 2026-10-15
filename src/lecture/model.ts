// "Lời giảng": the teacher's explanation of a page, cut where the slide's
// clicks are, so each piece is spoken just as its items appear. Nothing here
// needs timing by hand: the length of each spoken piece decides when the next
// click comes.
import type { BasicSlide, LecturePiece, SlideItem } from "../model/schema";

/** A moment of the page that gets its own piece of the lecture. */
export interface LectureSlot {
  /** 0: when the page opens; n: when click n shows its items. */
  step: number;
  label: string;
  /** What appears at that moment: the words, and pictures by name. */
  texts: string[];
  pictures: number;
}

/** The moments of the page: opening, then each click of its original slide. */
export function lectureSlots(slide: BasicSlide): LectureSlot[] {
  const items = slide.data.original?.items ?? [];
  const steps = Math.max(0, ...items.map((i) => i.step ?? 0));
  const at = (n: number) =>
    items.filter((i) => !i.locked && (i.step ?? 0) === n);
  const words = (list: SlideItem[]) =>
    list.flatMap((i) => i.text).filter((t) => t.trim());
  return Array.from({ length: steps + 1 }, (_, n) => ({
    step: n,
    label: n ? `Lần bấm ${n}` : "Khi mở trang",
    texts: words(at(n)),
    pictures: at(n).filter((i) => i.kind === "IMAGE").length,
  }));
}

/** The lecture with one piece per moment (missing pieces empty). */
export function lectureFor(slide: BasicSlide): LecturePiece[] {
  const slots = lectureSlots(slide);
  return slots.map((_, i) => slide.data.lecture[i] ?? { text: "" });
}

/** Whether the page has anything to say. */
export const hasLecture = (slide: BasicSlide) =>
  slide.data.lecture.some((p) => p.text.trim() || p.assetId);

/** Short reminder of what appears at a moment, for the editor. */
export function slotSummary(slot: LectureSlot) {
  const words = slot.texts.join(" · ");
  const pics = slot.pictures ? `${slot.pictures} hình` : "";
  const all = [words, pics].filter(Boolean).join(" + ");
  return all.length > 90 ? all.slice(0, 88) + "…" : all || "(không có gì mới)";
}
