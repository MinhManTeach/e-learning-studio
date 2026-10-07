import type { PedagogicalAnalysis } from "../import/model";
import type { BlueprintSlide, LessonBlueprint } from "./model";
import { refreshPlans, validateLessonBlueprint } from "./validation";

export interface BlueprintDraft {
  proposal: LessonBlueprint;
  current: LessonBlueprint;
  edited: boolean;
  approvedAt: string | null;
  nextSlideNumber: number;
}
export function createBlueprintDraft(b: LessonBlueprint): BlueprintDraft {
  return {
    proposal: structuredClone(b),
    current: structuredClone(b),
    edited: false,
    approvedAt: null,
    nextSlideNumber: 1,
  };
}
function update(d: BlueprintDraft, slides: BlueprintSlide[]): BlueprintDraft {
  return {
    ...d,
    edited: true,
    approvedAt: null,
    current: refreshPlans({
      ...d.current,
      proposedSlides: slides,
      updatedAt: new Date().toISOString(),
    }),
  };
}
export function editSlide(
  d: BlueprintDraft,
  id: string,
  patch: Partial<Omit<BlueprintSlide, "id" | "order">>,
) {
  return update(
    d,
    d.current.proposedSlides.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  );
}
function newId(d: BlueprintDraft) {
  let n = d.nextSlideNumber;
  const existing = new Set(
    [...d.current.proposedSlides, ...d.proposal.proposedSlides].map(
      (s) => s.id,
    ),
  );
  while (existing.has(`${d.current.id}:teacher:${n}`)) n++;
  return { id: `${d.current.id}:teacher:${n}`, nextSlideNumber: n + 1 };
}
export function duplicateSlide(d: BlueprintDraft, id: string) {
  const index = d.current.proposedSlides.findIndex((s) => s.id === id);
  if (index < 0) return d;
  const fresh = newId(d);
  const slides = [...d.current.proposedSlides];
  slides.splice(index + 1, 0, {
    ...structuredClone(slides[index]),
    id: fresh.id,
    title: `${slides[index].title} · Bản sao`,
  });
  return { ...update(d, slides), nextSlideNumber: fresh.nextSlideNumber };
}
export function addSlide(d: BlueprintDraft) {
  const fresh = newId(d);
  const slides = [...d.current.proposedSlides];
  const index =
    slides.at(-1)?.type === "COMPLETION" ? slides.length - 1 : slides.length;
  slides.splice(index, 0, {
    id: fresh.id,
    order: index + 1,
    type: "CONTENT",
    stage: "APPLICATION",
    title: "Trang bổ sung",
    pedagogicalPurpose: "Bổ sung trải nghiệm học tập",
    contentOutline: ["Thầy/cô bổ sung ý chính tại đây"],
    estimatedMinutes: 1,
    sourceOutcomeIds: [],
    interactionIntent: { type: "NONE", description: "" },
    mediaIntent: { type: "NONE", purpose: "", required: false },
  });
  return { ...update(d, slides), nextSlideNumber: fresh.nextSlideNumber };
}
export function deleteSlide(d: BlueprintDraft, id: string) {
  return update(
    d,
    d.current.proposedSlides.filter((s) => s.id !== id),
  );
}
export function moveSlide(d: BlueprintDraft, id: string, index: number) {
  const slides = [...d.current.proposedSlides];
  const from = slides.findIndex((s) => s.id === id);
  if (from < 0 || index < 0 || index >= slides.length) return d;
  const [slide] = slides.splice(from, 1);
  slides.splice(index, 0, slide);
  return update(d, slides);
}
export function restoreProposal(d: BlueprintDraft, confirmed: boolean) {
  if (d.edited && !confirmed)
    throw new Error("Kịch bản có chỉnh sửa của thầy/cô.");
  return {
    ...createBlueprintDraft(d.proposal),
    nextSlideNumber: d.nextSlideNumber,
  };
}
export function regenerateDraft(
  d: BlueprintDraft,
  b: LessonBlueprint,
  confirmed: boolean,
) {
  if (d.edited && !confirmed)
    throw new Error("Kịch bản có chỉnh sửa của thầy/cô.");
  return createBlueprintDraft(b);
}
export function approveBlueprint(d: BlueprintDraft, a: PedagogicalAnalysis) {
  const warnings = validateLessonBlueprint(d.current, a);
  if (warnings.some((w) => w.severity === "ERROR"))
    throw new Error("Cần sửa lỗi kịch bản trước khi duyệt.");
  return {
    ...d,
    current: { ...d.current, warnings },
    approvedAt: new Date().toISOString(),
  };
}
