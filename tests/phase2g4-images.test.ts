import { it, expect } from "vitest";
import { planSourceImages } from "../src/blueprint/sourceImages";
import { periodAnalysis } from "./support/phase2g4Fixture";
import { confirmPeriods } from "../src/blueprint/periods";
import { DeterministicLessonBlueprintProvider } from "../src/blueprint/generator";
import { importedDocumentSchema } from "../src/import/model";
import { mediaDocx } from "./fixtures/docxMedia";
import { importPlanFile } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { prepareDocxMedia } from "../src/media/docx";
import { LocalMediaAssetStore } from "../src/media/storage";
import { IDBFactory } from "fake-indexeddb";
import { outcomeCatalog } from "../src/blueprint/model";
import { createBlueprintDraft, editSlide } from "../src/blueprint/draft";
it("prioritizes an embedded source image in activity context and avoids unrelated repetition", async () => {
  const a = confirmPeriods(periodAnalysis(), ["p1", "p2"], 2, 35);
  a.classifications = [
    {
      id: "c",
      blockId: "b1",
      sourceText: a.teachingActivities[0].title,
      category: "TEACHING_ACTIVITY",
      field: "",
      confidence: 1,
      signals: [],
      isHeading: true,
      needsReview: false,
      corrected: false,
    },
  ];
  const d = importedDocumentSchema.parse({
    id: "d",
    sourceType: "DOCX",
    rawText: "source",
    importedAt: new Date().toISOString(),
    blocks: [
      { id: "b1", type: "PARAGRAPH", text: "Thực hành", sourceOrder: 1 },
    ],
    imagePlacements: [
      {
        id: "img",
        relationshipId: "r1",
        mediaId: "m1",
        status: "VALID",
        blockId: "b1",
        sourceOrder: 1,
        paragraphIndex: 0,
        imageOrder: 0,
        nearbyText: "Nháy chuột",
        altText: "Chuột máy tính",
        caption: "",
      },
    ],
  });
  const b = planSourceImages(
    d,
    a,
    await new DeterministicLessonBlueprintProvider().generate(a),
  );
  expect(b.proposedSlides.filter((s) => s.sourceImagePlacementId)).toHaveLength(
    1,
  );
  expect(
    b.proposedSlides.find((s) => s.sourceImagePlacementId)?.sourceActivityIds,
  ).toEqual(["a1"]);
  expect(
    b.proposedSlides.find((s) => s.sourceImagePlacementId)?.mediaIntent
      ?.visualDescription,
  ).toBe("Chuột máy tính");
});
it("attaches an approved source selection from local binary storage with original provenance", async () => {
  const bytes = mediaDocx();
  const d = await importPlanFile({
    name: "synthetic.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const a = await new DeterministicLessonAnalysisProvider().analyze(d);
  const b = await new DeterministicLessonBlueprintProvider().generate(a, d);
  const target = b.proposedSlides.find((s) => s.sourceImagePlacementId)!;
  expect(target).toBeDefined();
  const p = await new DeterministicLessonGenerationProvider().generate(b, {
    projectId: "image-test",
    now: new Date().toISOString(),
    outcomes: outcomeCatalog(a),
  });
  const store = new LocalMediaAssetStore(new IDBFactory(), crypto.randomUUID());
  const result = await prepareDocxMedia(p, d, a, b.proposedSlides, store);
  const slide = result.project.slides[b.proposedSlides.indexOf(target)];
  expect(slide.media.enabled).toBe(true);
  const asset = result.project.assets.find(
    (a) => a.id === slide.media.assetId,
  )!;
  expect(
    asset.docxSource?.placements.some(
      (p) => p.id === target.sourceImagePlacementId,
    ),
  ).toBe(true);
  expect((await store.get(asset.id, p.projectId))?.blob.size).toBeGreaterThan(
    0,
  );
  expect(result.project.assets.some((a) => a.url.includes("wikimedia"))).toBe(
    false,
  );
  const edited = editSlide(createBlueprintDraft(b), target.id, {
    mediaIntent: { type: "NONE", purpose: "", required: false },
  });
  expect(
    edited.current.proposedSlides.find((s) => s.id === target.id)
      ?.sourceImagePlacementId,
  ).toBeUndefined();
});
