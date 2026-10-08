import type { StoredMedia } from "./model";
export function detectImageMime(bytes: Uint8Array) {
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
}
export const maxImageBytes = 8 * 1024 * 1024;
export async function validateImageBlob(blob: Blob) {
  if (!blob.size || blob.size > maxImageBytes)
    throw new Error("Ảnh phải lớn hơn 0 và không quá 8 MB.");
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const detected = detectImageMime(bytes);
  if (!detected || blob.type !== detected)
    throw new Error(
      "Chỉ nhận PNG, JPEG hoặc WebP có nội dung hợp lệ; không nhận SVG.",
    );
  return detected;
}
export class LocalMediaAssetStore {
  private connection?: Promise<IDBDatabase>;
  constructor(
    private factory?: IDBFactory,
    private name = "elearning-studio-media",
  ) {}
  private open() {
    return (this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.factory ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error("Trình duyệt không hỗ trợ kho ảnh IndexedDB."));
        return;
      }
      const request = factory.open(this.name, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("assets", {
          keyPath: ["projectId", "assetId"],
        });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.connection = undefined;
        reject(new Error("Không mở được kho ảnh trên thiết bị."));
      };
      request.onblocked = () =>
        reject(new Error("Kho ảnh đang bị chặn bởi cửa sổ khác."));
    }));
  }
  private async request<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("assets", mode);
      const request = operation(transaction.objectStore("assets"));
      transaction.oncomplete = () => resolve(request.result);
      const fail = () =>
        reject(
          new Error(
            transaction.error?.name === "QuotaExceededError" ||
              request.error?.name === "QuotaExceededError"
              ? "Kho ảnh đã đầy. Giảm kích thước ảnh rồi thử lại."
              : "Không thể đọc/lưu ảnh trong IndexedDB.",
          ),
        );
      transaction.onerror = fail;
      transaction.onabort = fail;
    });
  }
  private async write(value: StoredMedia, insertOnly: boolean) {
    const mime = await validateImageBlob(value.blob);
    if (
      mime !== value.mimeType ||
      value.size !== value.blob.size ||
      !value.projectId ||
      !value.assetId
    )
      throw new Error("Dữ liệu ảnh không hợp lệ.");
    await this.request("readwrite", (store) =>
      insertOnly ? store.add(value) : store.put(value),
    );
  }
  async put(value: StoredMedia) {
    await this.write(value, false);
  }
  // Restore must never overwrite a pre-existing project-scoped binary.
  async addNew(value: StoredMedia) {
    await this.write(value, true);
  }
  async get(
    assetId: string,
    projectId: string,
  ): Promise<StoredMedia | undefined> {
    return this.request("readonly", (store) => store.get([projectId, assetId]));
  }
  // Removal is explicit and project-scoped; replacements never delete shared binaries.
  async remove(assetId: string, projectId: string) {
    await this.request("readwrite", (store) =>
      store.delete([projectId, assetId]),
    );
  }
}
export const localMediaStore = new LocalMediaAssetStore();
