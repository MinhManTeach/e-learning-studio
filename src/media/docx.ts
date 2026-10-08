import type {
  ImportedLessonDocument,
  PedagogicalAnalysis,
} from "../import/model";
import type { AssetReference, LessonProject, Slide } from "../model/schema";
import { parseProject } from "../model/schema";
import type { BlueprintSlide } from "../blueprint/model";
import {
  localMediaStore,
  LocalMediaAssetStore,
  validateImageBlob,
} from "./storage";
import { localAssetPath, attachMedia } from "./service";
const normalized = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/^\s*(?:\d+[.)]|[ivx]+[.)])\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
export function associateDocxImages(
  document: ImportedLessonDocument,
  analysis: PedagogicalAnalysis,
) {
  const order = new Map(document.blocks.map((b) => [b.id, b.sourceOrder]));
  const boundaries = analysis.teachingActivities
    .flatMap((activity) => {
      const title = normalized(activity.title);
      const heading = analysis.classifications.find(
        (c) => c.isHeading && normalized(c.sourceText) === title,
      );
      return heading
        ? [
            {
              activity,
              blockId: heading.blockId,
              order: order.get(heading.blockId) ?? -1,
              row: heading.row ?? -1,
            },
          ]
        : [];
    })
    .sort((a, b) => a.order - b.order || a.row - b.row);
  return (document.imagePlacements ?? []).map((p) => {
    const boundary = boundaries
      .filter(
        (b) =>
          b.order < p.sourceOrder ||
          (b.order === p.sourceOrder && b.row <= (p.row ?? -1)),
      )
      .at(-1);
    const sub = boundary?.activity.subactivities
      ?.filter(
        (s) =>
          (order.get(s.blockId) ?? -1) < p.sourceOrder ||
          (s.blockId === p.blockId && (s.row ?? -1) <= (p.row ?? -1)),
      )
      .at(-1);
    return {
      ...p,
      activityId: boundary?.activity.id,
      activityTitle: boundary?.activity.title,
      subactivityTitle: sub?.title,
      needsReview: !boundary || p.status !== "VALID",
    };
  });
}
export async function prepareDocxMedia(
  project: LessonProject,
  document: ImportedLessonDocument,
  analysis: PedagogicalAnalysis,
  outlines: BlueprintSlide[],
  store: LocalMediaAssetStore = localMediaStore,
) {
  const next = parseProject(project);
  const created: string[] = [];
  const rollback = async () => {
    await Promise.all(created.map((id) => store.remove(id, project.projectId)));
  };
  const placements = associateDocxImages(document, analysis);
  try {
    for (const media of document.mediaAssets ?? []) {
      const positions = placements.filter(
        (p) => p.mediaId === media.id && p.status === "VALID",
      );
      if (!positions.length) continue;
      const checksum = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(media.bytes)),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const id = "docx-" + checksum;
      const blob = new Blob([new Uint8Array(media.bytes)], {
        type: media.contentType,
      });
      await validateImageBlob(blob);
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob);
        try {
          if (
            !bitmap.width ||
            !bitmap.height ||
            bitmap.width * bitmap.height > 24_000_000
          )
            throw new Error("Ảnh DOCX vượt giới hạn kích thước.");
        } finally {
          bitmap.close();
        }
      }
      const attribution =
        "Nguồn KHBD: " +
        (document.fileName ?? "DOCX của giáo viên") +
        " · Giáo viên cung cấp; quyền tái sử dụng chưa được xác minh.";
      if (!(await store.get(id, project.projectId))) {
        await store.put({
          projectId: project.projectId,
          assetId: id,
          blob,
          mimeType: media.contentType,
          size: blob.size,
          source: {
            title: positions[0].caption || positions[0].altText || "Ảnh KHBD",
            provider: "DOCX",
            sourceUrl: "",
            creator: "Giáo viên cung cấp",
            license: "USER_PROVIDED_UNVERIFIED",
            licenseUrl: "",
            attribution,
          },
        });
        created.push(id);
      }
      const existing = next.assets.find((a) => a.id === id);
      const previous = existing?.docxSource?.placements ?? [];
      const combined = [
        ...previous,
        ...positions.filter((p) => !previous.some((old) => old.id === p.id)),
      ].sort((a, b) => a.imageOrder - b.imageOrder);
      const asset: AssetReference = {
        id,
        kind: "IMAGE",
        sourceType: "UPLOAD",
        name: positions[0].caption || positions[0].altText || "Ảnh KHBD",
        fileName: media.path.split("/").at(-1) ?? "",
        mimeType: media.contentType,
        size: blob.size,
        url: localAssetPath(id),
        altText:
          positions[0].altText || positions[0].caption || "Minh họa từ KHBD",
        status: "LOCAL",
        docxSource: {
          documentId: document.id,
          fileName: document.fileName ?? "",
          checksum,
          license: "USER_PROVIDED_UNVERIFIED",
          attribution,
          placements: combined,
        },
      };
      next.assets = next.assets.filter((a) => a.id !== id);
      next.assets.push(asset);
    }
    next.slides = next.slides.map((slide, i) => {
      const outline = outlines[i];
      if (!outline) return slide;
      const text = normalized(outline.contentOutline.join("\n"));
      const references: NonNullable<Slide["sourceContext"]> =
        analysis.classifications
          .filter(
            (c) =>
              !c.isHeading &&
              c.sourceText.length > 12 &&
              text.includes(normalized(c.sourceText)),
          )
          .map((c) => ({ blockId: c.blockId, row: c.row, column: c.column }));
      // Retain activity provenance when generation paraphrases the body.
      // An activity match remains a suggestion requiring teacher review.
      const activity = analysis.teachingActivities.find(
        (a) => normalized(a.title) === normalized(outline.title),
      );
      const heading =
        activity &&
        analysis.classifications.find(
          (c) =>
            c.isHeading &&
            normalized(c.sourceText) === normalized(activity.title),
        );
      if (activity && heading)
        references.push({
          blockId: heading.blockId,
          row: heading.row,
          column: heading.column,
          activityId: activity.id,
        });
      return {
        ...slide,
        sourceContext: [...(outline.sourceContext ?? []), ...references],
      };
    });
    // Exact teacher-reviewed blueprint selections take priority over external search.
    const used = new Set<string>();
    for (const [i, outline] of outlines.entries()) {
      if (
        !outline.sourceImagePlacementId ||
        outline.mediaIntent?.type !== "IMAGE" ||
        !next.slides[i]
      )
        continue;
      const asset = next.assets.find((a) =>
        a.docxSource?.placements.some(
          (p) => p.id === outline.sourceImagePlacementId,
        ),
      );
      if (!asset || (used.has(asset.id) && !outline.sourceImageTeacherSelected))
        continue;
      const attached = attachMedia(
        next,
        next.slides[i].id,
        asset,
        asset.docxSource?.placements.find(
          (p) => p.id === outline.sourceImagePlacementId,
        )?.caption ?? "",
      );
      next.slides = attached.slides;
      used.add(asset.id);
    }
    return { project: parseProject(next), rollback };
  } catch (e) {
    await rollback();
    throw e;
  }
}
export function rankSourceImages(project: LessonProject, slide: Slide) {
  const content = normalized(slide.title + " " + JSON.stringify(slide.data));
  return project.assets
    .flatMap((asset) =>
      (asset.docxSource?.placements ?? []).map((placement) => {
        const exact = slide.sourceContext?.some(
          (ref) =>
            ref.blockId === placement.blockId &&
            ref.row === placement.row &&
            ref.column === placement.column,
        );
        const activity = slide.sourceContext?.some(
          (ref) => ref.activityId && ref.activityId === placement.activityId,
        );
        const words = normalized(placement.nearbyText)
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w.length > 3);
        const overlap = new Set(words.filter((w) => content.includes(w))).size;
        const score = exact ? 100 : activity ? 60 : Math.min(30, overlap * 3);
        return {
          asset,
          placement,
          score,
          reason: exact
            ? "EXACT_SOURCE"
            : activity
              ? "ACTIVITY_CONTEXT"
              : "TEACHER_REVIEW",
        };
      }),
    )
    .sort(
      (a, b) =>
        b.score - a.score || a.placement.imageOrder - b.placement.imageOrder,
    );
}
