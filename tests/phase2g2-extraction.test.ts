import { it, expect } from "vitest";
import { extractDocx } from "../src/import/docx";
import { importPlanFile } from "../src/import/documents";
import { mediaDocx, samplePng } from "./fixtures/docxMedia";
it("extracts seven actual placements in document order, not eight media inventory files", () => {
  const d = extractDocx(mediaDocx());
  expect(d.imagePlacements).toHaveLength(7);
  expect(d.imagePlacements.map((p) => p.relationshipId)).toEqual([
    "rId1",
    "rId2",
    "rId3",
    "rId4",
    "rId5",
    "rId6",
    "rId7",
  ]);
  expect(d.imagePlacements.map((p) => p.imageOrder)).toEqual([
    0, 1, 2, 3, 4, 5, 6,
  ]);
  expect(d.mediaAssets).toHaveLength(7);
  expect(d.mediaAssets[0].bytes).toEqual(samplePng);
  expect(d.mediaAssets[0].contentType).toBe("image/png");
});
it("retains table cell, merged cell, paragraph position and meaningful source context", () => {
  const d = extractDocx(mediaDocx());
  const first = d.imagePlacements[0],
    last = d.imagePlacements[6];
  expect(first).toMatchObject({
    row: 4,
    column: 0,
    paragraphIndex: 1,
    altText: "Minh họa mẫu 1",
  });
  expect(first.nearbyText).toContain("GV giới thiệu mẫu thứ nhất.");
  expect(first.caption).toBe("Hình 1. Mẫu thứ nhất");
  expect(last).toMatchObject({ row: 8, column: 0, paragraphIndex: 1 });
  expect(
    d.blocks.find((b) => b.id === last.blockId)?.table?.rows[8].cells[0]
      .colspan,
  ).toBe(3);
});
it("preserves repeated placements independently from media binaries", () => {
  const d = extractDocx(mediaDocx({ duplicate: true }));
  expect(d.imagePlacements).toHaveLength(8);
  expect(d.mediaAssets).toHaveLength(7);
  expect(
    d.imagePlacements.filter((p) => p.relationshipId === "rId1"),
  ).toHaveLength(2);
});
it("does not fetch external image relationships and reports missing binaries", () => {
  const d = extractDocx(mediaDocx({ external: true }));
  expect(d.imagePlacements[0].status).toBe("UNSUPPORTED");
  expect(d.mediaAssets).toHaveLength(6);
  const broken = extractDocx(mediaDocx({ broken: true }));
  expect(broken.imagePlacements[0].status).toBe("MISSING");
  expect(broken.warnings.length).toBeGreaterThan(0);
});
it("rejects declared MIME inconsistent with actual bytes", () => {
  expect(() => extractDocx(mediaDocx({ mime: "image/jpeg" }))).toThrow(
    /MIME|định dạng/,
  );
});
it("preserves binaries through the public DOCX import boundary", async () => {
  const bytes = mediaDocx();
  const d = await importPlanFile({
    name: "synthetic.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  expect(d.imagePlacements).toHaveLength(7);
  expect(d.mediaAssets?.[0].bytes).toEqual(samplePng);
});

it("keeps actual continuation-row placement inside a vertically merged cell", async () => {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const zip = unzipSync(mediaDocx());
  let xml = strFromU8(zip["word/document.xml"]);
  xml = xml.replace("<w:tcPr>", '<w:tcPr><w:vMerge w:val="restart"/>');
  // Add an image-bearing continuation row to an independent two-row table.
  const pic =
    '<w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>';
  xml = xml.replace(
    "</w:body>",
    '<w:tbl><w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Start</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>' +
      pic +
      "</w:tc></w:tr></w:tbl></w:body>",
  );
  zip["word/document.xml"] = strToU8(xml);
  const d = extractDocx(zipSync(zip));
  const last = d.imagePlacements.at(-1)!;
  expect(last.row).toBe(1);
  expect(last.column).toBe(0);
  expect(
    d.blocks.find((b) => b.id === last.blockId)?.table?.rows[0].cells[0]
      .rowspan,
  ).toBe(2);
});
it("reports unsafe relationship targets rather than loading them", async () => {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const zip = unzipSync(mediaDocx());
  zip["word/_rels/document.xml.rels"] = strToU8(
    strFromU8(zip["word/_rels/document.xml.rels"]).replace(
      "media/asset-7.png",
      "../secret.png",
    ),
  );
  const d = extractDocx(zipSync(zip));
  expect(d.imagePlacements[0].status).toBe("UNSUPPORTED");
  expect(d.mediaAssets).toHaveLength(6);
});
it("reports unsupported source image types explicitly without discarding placement provenance", () => {
  const d = extractDocx(mediaDocx({ mime: "image/svg+xml" }));
  expect(d.imagePlacements).toHaveLength(7);
  expect(d.mediaAssets).toHaveLength(0);
  expect(d.imagePlacements.every((p) => p.status === "UNSUPPORTED")).toBe(true);
});

it("retains nearby captions for images outside tables", async () => {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const zip = unzipSync(mediaDocx());
  let xml = strFromU8(zip["word/document.xml"]);
  xml = xml.replace(
    "</w:body>",
    '<w:p><w:r><w:t>Quan sát minh họa bên dưới.</w:t></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p><w:p><w:r><w:t>Hình 8. Minh họa nguồn</w:t></w:r></w:p></w:body>',
  );
  zip["word/document.xml"] = strToU8(xml);
  const d = extractDocx(zipSync(zip));
  expect(d.imagePlacements.at(-1)?.nearbyText).toContain(
    "Quan sát minh họa bên dưới.",
  );
  expect(d.imagePlacements.at(-1)?.caption).toBe("Hình 8. Minh họa nguồn");
});
it("does not count an AlternateContent fallback as a second visible image", async () => {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const zip = unzipSync(mediaDocx());
  let xml = strFromU8(zip["word/document.xml"]);
  xml = xml.replace(
    "</w:body>",
    '<w:p><w:r><mc:AlternateContent xmlns:mc="mc" xmlns:v="v"><mc:Choice><w:drawing><a:blip r:embed="rId1"/></w:drawing></mc:Choice><mc:Fallback><w:pict><v:imagedata r:id="rId1"/></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p></w:body>',
  );
  zip["word/document.xml"] = strToU8(xml);
  expect(extractDocx(zipSync(zip)).imagePlacements).toHaveLength(8);
});
