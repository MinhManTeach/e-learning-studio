import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { LocalMediaAssetStore, validateImageBlob } from "../src/media/storage";
import { isReusableLicense, safeMediaUrl } from "../src/media/model";

const png = () =>
  new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], {
    type: "image/png",
  });
describe("Phase 2D binary boundary", () => {
  it("validates raster signatures and rejects disguised SVG", async () => {
    await expect(validateImageBlob(png())).resolves.toBe("image/png");
    await expect(
      validateImageBlob(
        new Blob(['<svg onload="alert(1)"/>'], { type: "image/png" }),
      ),
    ).rejects.toThrow();
    await expect(
      validateImageBlob(new Blob(["x"], { type: "image/svg+xml" })),
    ).rejects.toThrow();
  });
  it("persists binary and ownership across store instances", async () => {
    const factory = new IDBFactory();
    const first = new LocalMediaAssetStore(factory, "phase2d-test");
    await first.put({
      assetId: "a",
      projectId: "p",
      blob: png(),
      mimeType: "image/png",
      size: 9,
      source: {
        title: "Upload",
        provider: "UPLOAD",
        sourceUrl: "",
        creator: "",
        license: "USER_PROVIDED",
        licenseUrl: "",
        attribution: "",
      },
    });
    const reopened = new LocalMediaAssetStore(factory, "phase2d-test");
    expect((await reopened.get("a", "p"))?.blob.size).toBe(9);
    expect(await reopened.get("a", "other-project")).toBeUndefined();
    expect(await reopened.get("missing", "p")).toBeUndefined();
  });
  it("only accepts explicit compatible license labels and HTTPS media URLs", () => {
    expect(isReusableLicense("CC BY-SA 4.0")).toBe(true);
    expect(isReusableLicense("Unknown")).toBe(false);
    expect(isReusableLicense("CC BY-NC 4.0")).toBe(false);
    expect(safeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(safeMediaUrl("https://upload.wikimedia.org/a.jpg")).toBe(true);
  });
  it("accepts JPEG/WebP signatures and rejects empty, oversized and mismatched files", async () => {
    await expect(
      validateImageBlob(
        new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }),
      ),
    ).resolves.toBe("image/jpeg");
    await expect(
      validateImageBlob(new Blob(["RIFF1234WEBPdata"], { type: "image/webp" })),
    ).resolves.toBe("image/webp");
    await expect(
      validateImageBlob(new Blob([], { type: "image/png" })),
    ).rejects.toThrow();
    await expect(
      validateImageBlob(
        new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "image/png" }),
      ),
    ).rejects.toThrow("8 MB");
    await expect(
      validateImageBlob(
        new Blob([new Uint8Array([255, 216, 255])], { type: "image/png" }),
      ),
    ).rejects.toThrow();
  });
  it("reports quota errors instead of claiming a completed write", async () => {
    const transaction = {
      error: new DOMException("full", "QuotaExceededError"),
      onabort: null as null | (() => void),
      onerror: null as null | (() => void),
    };
    const request = { error: transaction.error };
    const db = {
      transaction: () => {
        queueMicrotask(() => transaction.onabort?.());
        return {
          ...transaction,
          objectStore: () => ({ put: () => request }),
          set onabort(value: () => void) {
            transaction.onabort = value;
          },
          set onerror(value: () => void) {
            transaction.onerror = value;
          },
        };
      },
    };
    const storage = new LocalMediaAssetStore();
    const open = vi
      .spyOn(storage as unknown as { open: () => Promise<IDBDatabase> }, "open")
      .mockResolvedValue(db as unknown as IDBDatabase);
    await expect(
      storage.put({
        assetId: "a",
        projectId: "p",
        blob: png(),
        mimeType: "image/png",
        size: 9,
        source: {
          title: "Upload",
          provider: "UPLOAD",
          sourceUrl: "",
          creator: "",
          license: "USER_PROVIDED",
          licenseUrl: "",
          attribution: "",
        },
      }),
    ).rejects.toThrow("đầy");
    open.mockRestore();
  });
});
