import { expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { LocalMediaAssetStore } from "../src/media/storage";
import type { StoredMedia } from "../src/media/model";

const mp4 = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
]);
const record = (bytes: Uint8Array, type: string): StoredMedia => ({
  assetId: "clip",
  projectId: "lesson",
  blob: new Blob([new Uint8Array(bytes)], { type }),
  mimeType: type,
  size: bytes.length,
  source: {
    title: "Buổi học đầu tiên của Khoa",
    provider: "UPLOAD",
    sourceUrl: "",
    creator: "",
    license: "",
    licenseUrl: "",
    attribution: "",
  },
});

it("keeps lesson videos on this device next to the images", async () => {
  const store = new LocalMediaAssetStore(new IDBFactory(), "videos");
  await store.put(record(mp4, "video/mp4"));
  const saved = await store.get("clip", "lesson");
  expect(saved?.mimeType).toBe("video/mp4");
  expect(saved?.size).toBe(mp4.length);
});

it("refuses a file that claims to be a video but is not one", async () => {
  const store = new LocalMediaAssetStore(new IDBFactory(), "videos-bad");
  await expect(
    store.put(record(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), "video/mp4")),
  ).rejects.toThrow("Chỉ nhận video MP4 hoặc WebM có nội dung hợp lệ.");
  await expect(store.put(record(mp4, "video/webm"))).rejects.toThrow(
    "Chỉ nhận video MP4 hoặc WebM",
  );
});
