import { it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { mediaDocx, samplePng } from "./fixtures/docxMedia";
import { importPlanFile } from "../src/import/documents";
import { DeterministicLessonAnalysisProvider } from "../src/import/analyzer";
import { createProject } from "../src/model/factories";
import { LocalMediaAssetStore } from "../src/media/storage";
import {
  prepareDocxMedia,
  associateDocxImages,
  rankSourceImages,
} from "../src/media/docx";
import { parseProject } from "../src/model/schema";
import { attachMedia } from "../src/media/service";
async function fixture() {
  const bytes = mediaDocx();
  const document = await importPlanFile({
    name: "synthetic.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const analysis = await new DeterministicLessonAnalysisProvider().analyze(
    document,
  );
  return { document, analysis };
}
it("associates six discovery images and the matching image with practice in source order", async () => {
  const { document, analysis } = await fixture();
  const placements = associateDocxImages(document, analysis);
  expect(placements.map((p) => p.activityTitle)).toEqual([
    ...Array(6).fill(analysis.teachingActivities[1].title),
    analysis.teachingActivities[2].title,
  ]);
  expect(placements[0].subactivityTitle).toContain("9");
  expect(placements[2].subactivityTitle).toContain("8");
});
it("deduplicates identical binaries while preserving all placements and unverified attribution", async () => {
  const { document, analysis } = await fixture();
  const store = new LocalMediaAssetStore(
    new IDBFactory(),
    "docx-" + crypto.randomUUID(),
  );
  const put = vi.spyOn(store, "put");
  const result = await prepareDocxMedia(
    createProject(),
    document,
    analysis,
    [],
    store,
  );
  expect(result.project.assets).toHaveLength(1);
  expect(put).toHaveBeenCalledTimes(1);
  const asset = result.project.assets[0];
  expect(asset.docxSource?.placements).toHaveLength(7);
  expect(asset.docxSource?.license).toBe("USER_PROVIDED_UNVERIFIED");
  const record = await store.get(asset.id, result.project.projectId);
  expect(new Uint8Array(await record!.blob.arrayBuffer())).toEqual(samplePng);
  expect(JSON.stringify(result.project)).not.toContain("base64");
  expect(JSON.stringify(result.project)).not.toContain("bytes");
  await prepareDocxMedia(result.project, document, analysis, [], store);
  expect(put).toHaveBeenCalledTimes(1);
});
it("preserves source metadata and selected media through save/reopen JSON parsing", async () => {
  const { document, analysis } = await fixture();
  const store = new LocalMediaAssetStore(
    new IDBFactory(),
    "docx-" + crypto.randomUUID(),
  );
  const result = await prepareDocxMedia(
    createProject(),
    document,
    analysis,
    [],
    store,
  );
  const selected = attachMedia(
    result.project,
    result.project.slides[0].id,
    result.project.assets[0],
    "Nguồn KHBD",
  );
  const restored = parseProject(JSON.parse(JSON.stringify(selected)));
  expect(restored.assets[0].docxSource).toEqual(selected.assets[0].docxSource);
  expect(restored.slides[0].media.assetId).toBe(selected.assets[0].id);
  expect(
    await store.get(restored.assets[0].id, restored.projectId),
  ).toBeDefined();
});
it("rolls back only newly collected project-owned binaries on failure", async () => {
  const { document, analysis } = await fixture();
  const store = new LocalMediaAssetStore(
    new IDBFactory(),
    "docx-" + crypto.randomUUID(),
  );
  const result = await prepareDocxMedia(
    createProject(),
    document,
    analysis,
    [],
    store,
  );
  const other = { ...result.project, projectId: "other" };
  await prepareDocxMedia(other, document, analysis, [], store);
  await result.rollback();
  expect(
    await store.get(result.project.assets[0].id, result.project.projectId),
  ).toBeUndefined();
  expect(await store.get(result.project.assets[0].id, "other")).toBeDefined();
});
it("ranks exact source row above activity context and excludes unrelated filename matches", async () => {
  const { document, analysis } = await fixture();
  const result = await prepareDocxMedia(
    createProject(),
    document,
    analysis,
    [],
    new LocalMediaAssetStore(new IDBFactory(), "docx-" + crypto.randomUUID()),
  );
  const slide = {
    ...result.project.slides[0],
    sourceContext: [
      { blockId: document.imagePlacements![0].blockId, row: 4, column: 0 },
    ],
  };
  const ranked = rankSourceImages(result.project, slide);
  expect(ranked[0].reason).toBe("EXACT_SOURCE");
  expect(ranked[0].placement.row).toBe(4);
});

it("uses an activity-boundary match when generated content is paraphrased", async () => {
  const { document, analysis } = await fixture();
  const { generationFixture } = await import("./support/phase2cFixture");
  const { b } = await generationFixture();
  const outline = {
    ...b.proposedSlides[0],
    title: analysis.teachingActivities[1].title,
    contentOutline: ["Nội dung diễn đạt lại cho học sinh."],
  };
  const result = await prepareDocxMedia(
    createProject(),
    document,
    analysis,
    [outline],
    new LocalMediaAssetStore(new IDBFactory(), "docx-" + crypto.randomUUID()),
  );
  const candidates = rankSourceImages(result.project, result.project.slides[0]);
  expect(
    candidates.filter((c) => c.reason === "ACTIVITY_CONTEXT"),
  ).toHaveLength(6);
  expect(candidates[0].placement.imageOrder).toBe(0);
  expect(candidates.at(-1)?.placement.imageOrder).toBe(6);
});
