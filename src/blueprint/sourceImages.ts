import type {
  ImportedLessonDocument,
  PedagogicalAnalysis,
} from "../import/model";
import type { LessonBlueprint } from "./model";
import { associateDocxImages } from "../media/docx";

export function planSourceImages(
  document: ImportedLessonDocument,
  analysis: PedagogicalAnalysis,
  blueprint: LessonBlueprint,
): LessonBlueprint {
  const next = structuredClone(blueprint);
  const placements = associateDocxImages(document, analysis);
  const used = new Set<string>();
  for (const s of next.proposedSlides) {
    if (!s.mediaIntent || s.mediaIntent.type === "NONE") continue;
    const candidate = placements.find(
      (p) =>
        p.status === "VALID" &&
        p.mediaId &&
        !used.has(p.mediaId) &&
        (!next.periodReview ||
          (!!p.activityId &&
            next.activityPlan?.some((t) => t.activity.id === p.activityId))) &&
        (s.sourceContext?.some(
          (r) =>
            r.blockId === p.blockId && r.row === p.row && r.column === p.column,
        ) ||
          (!!p.activityId && s.sourceActivityIds?.includes(p.activityId))),
    );
    if (!candidate) continue;
    used.add(candidate.mediaId!);
    s.sourceImagePlacementId = candidate.id;
    s.mediaIntent = {
      type: "IMAGE",
      purpose: s.mediaIntent.purpose,
      visualDescription:
        candidate.altText ||
        candidate.caption ||
        "Ảnh nguồn cần đối chiếu trong hoạt động.",
      required: s.mediaIntent.required,
    };
  }
  return next;
}
