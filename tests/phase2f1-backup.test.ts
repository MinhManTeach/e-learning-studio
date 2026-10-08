import { expect, it } from "vitest";
import { createBackup, inspectBackup } from "../src/backup/package";
import { backupFixture, png } from "./fixtures/backup";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import { sha256 } from "../src/backup/package";
it("collects real binaries, versioned inventory, SHA-256 and canonical teacher data", async () => {
  const { p, media } = await backupFixture();
  const bytes = await createBackup(p, media);
  const inspected = await inspectBackup(bytes);
  expect(inspected.project).toEqual(p);
  expect(inspected.manifest.version).toBe(1);
  expect(inspected.manifest.assets[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(new Uint8Array(await inspected.media[0].blob.arrayBuffer())).toEqual(
    png,
  );
});
it("blocks missing binary with affected slide and asset rather than exporting incomplete data", async () => {
  const { p, media } = await backupFixture();
  await media.remove("picture", p.projectId);
  await expect(createBackup(p, media)).rejects.toThrow(
    /Thiếu hình ảnh.*picture/,
  );
});
it("enumerates shared references once and retains source attribution", async () => {
  const { p, media } = await backupFixture();
  p.slides[1].media = { ...p.slides[0].media };
  const inspected = await inspectBackup(await createBackup(p, media));
  expect(inspected.media).toHaveLength(1);
  expect(inspected.manifest.assets[0].source.creator).toBe("Teacher");
  expect(inspected.project.slides[1].media.assetId).toBe("picture");
});
it("preserves unreferenced empty generation suggestions explicitly, but blocks referenced missing images", async () => {
  const { p, media } = await backupFixture();
  p.assets.push({
    ...p.assets[0],
    id: "suggestion",
    sourceType: "LIBRARY",
    status: "EXTERNAL",
    url: "",
    mimeType: "",
    fileName: "",
  });
  const inspected = await inspectBackup(await createBackup(p, media));
  expect(inspected.project.assets).toEqual(p.assets);
  expect(inspected.manifest.unattachedSuggestions).toEqual(["suggestion"]);
  expect(inspected.media).toHaveLength(1);
  p.slides[0].media.assetId = "suggestion";
  await expect(createBackup(p, media)).rejects.toThrow(/cục bộ/);
});
it.each(["checksum", "missing", "duplicate", "signature", "mime", "inventory"])(
  "rejects invalid asset %s before persistence",
  async (kind) => {
    const { p, media } = await backupFixture();
    const files = unzipSync(await createBackup(p, media)),
      m = JSON.parse(strFromU8(files["manifest.json"])),
      asset = m.assets[0];
    if (kind === "checksum") asset.sha256 = "0".repeat(64);
    if (kind === "missing") delete files[asset.path];
    if (kind === "duplicate") m.assets.push(asset);
    if (kind === "inventory") asset.id = "unknown";
    if (kind === "mime") asset.mimeType = "image/svg+xml";
    if (kind === "signature") {
      files[asset.path] = new Uint8Array(png.length);
      asset.sha256 = await sha256(files[asset.path]);
    }
    files["manifest.json"] = strToU8(JSON.stringify(m));
    await expect(inspectBackup(zipSync(files, { level: 0 }))).rejects.toThrow();
  },
);
it("blocks unsupported external assets and oversized or wrong-signature binaries", async () => {
  const { p, media } = await backupFixture();
  p.assets[0].status = "EXTERNAL";
  await expect(createBackup(p, media)).rejects.toThrow(/cục bộ/);
  p.assets[0].status = "LOCAL";
  const original = (await media.get("picture", p.projectId))!;
  for (const blob of [
    new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "image/png" }),
    new Blob([png], { type: "image/jpeg" }),
  ]) {
    await expect(
      createBackup(p, {
        get: async () => ({ ...original, blob, size: blob.size }),
      }),
    ).rejects.toThrow();
  }
});
