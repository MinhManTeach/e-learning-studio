import { createProject, createSlide } from "../../src/model/factories";
import { LocalMediaAssetStore } from "../../src/media/storage";
import { IDBFactory } from "fake-indexeddb";

export const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
export async function backupFixture() {
  const p = createProject();
  const s = createSlide("content");
  s.media = {
    ...s.media,
    enabled: true,
    assetId: "picture",
    caption: "Author CC BY",
  };
  p.slides = [s, createSlide("quiz"), createSlide("scenario")];
  p.assets = [
    {
      id: "picture",
      kind: "IMAGE",
      sourceType: "UPLOAD",
      name: "Photo",
      fileName: "photo.png",
      mimeType: "image/png",
      url: "local-media:picture",
      altText: "Ảnh",
      status: "LOCAL",
    },
  ];
  const media = new LocalMediaAssetStore(new IDBFactory(), crypto.randomUUID());
  await media.put({
    assetId: "picture",
    projectId: p.projectId,
    blob: new Blob([png], { type: "image/png" }),
    mimeType: "image/png",
    size: png.length,
    source: {
      title: "Photo",
      provider: "UPLOAD",
      sourceUrl: "",
      creator: "Teacher",
      license: "",
      licenseUrl: "",
      attribution: "Teacher",
    },
  });
  return { p, media };
}
