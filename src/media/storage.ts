import type { StoredMedia } from "./model";
export function detectImageMime(bytes: Uint8Array) {
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
}
/** Pictures from a PowerPoint may also be GIF (often animated); kept as they are. */
export function detectPictureMime(bytes: Uint8Array) {
  const gif = /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6)));
  return detectImageMime(bytes) || (gif ? "image/gif" : "");
}
export function detectVideoMime(bytes: Uint8Array) {
  if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "video/mp4";
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm";
  return "";
}
/** Recorded voice ("Tạo giọng đọc"): AAC in an MP4 container (.m4a). */
export function detectAudioMime(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    ? "audio/mp4"
    : "";
}
/** Sounds and music from a PowerPoint: MP3, WAV, OGG or M4A, recognised by their bytes. */
export function detectSoundMime(bytes: Uint8Array) {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  // An MP3 frame header: 11 set sync bits, MPEG version not "reserved".
  if (
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    (bytes[1] & 0x18) !== 0x08
  )
    return "audio/mpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  return detectAudioMime(bytes);
}
export const maxSoundBytes = 20 * 1024 * 1024;
export async function validateSoundBlob(blob: Blob) {
  if (!blob.size || blob.size > maxSoundBytes)
    throw new Error("Tệp âm thanh phải lớn hơn 0 và không quá 20 MB.");
  const detected = detectSoundMime(
    new Uint8Array(await blob.slice(0, 16).arrayBuffer()),
  );
  if (!detected || blob.type !== detected)
    throw new Error("Chỉ nhận âm thanh MP3, WAV, OGG hoặc M4A hợp lệ.");
  return detected;
}
export const maxAudioBytes = 5 * 1024 * 1024;
export async function validateAudioBlob(blob: Blob) {
  if (!blob.size || blob.size > maxAudioBytes)
    throw new Error("Tệp giọng đọc phải lớn hơn 0 và không quá 5 MB.");
  const detected = detectAudioMime(
    new Uint8Array(await blob.slice(0, 16).arrayBuffer()),
  );
  if (!detected || blob.type !== detected)
    throw new Error("Tệp giọng đọc không phải M4A hợp lệ.");
  return detected;
}
export const maxImageBytes = 8 * 1024 * 1024;
export const maxVideoBytes = 200 * 1024 * 1024;
export async function validateVideoBlob(blob: Blob) {
  if (!blob.size || blob.size > maxVideoBytes)
    throw new Error("Video phải lớn hơn 0 và không quá 200 MB.");
  const detected = detectVideoMime(
    new Uint8Array(await blob.slice(0, 16).arrayBuffer()),
  );
  if (!detected || blob.type !== detected)
    throw new Error("Chỉ nhận video MP4 hoặc WebM có nội dung hợp lệ.");
  return detected;
}
export async function validateImageBlob(blob: Blob) {
  if (!blob.size || blob.size > maxImageBytes)
    throw new Error("Ảnh phải lớn hơn 0 và không quá 8 MB.");
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const detected = detectPictureMime(bytes);
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
    const mime = value.mimeType.startsWith("video/")
      ? await validateVideoBlob(value.blob)
      : value.mimeType.startsWith("audio/")
        ? await validateSoundBlob(value.blob)
        : await validateImageBlob(value.blob);
    if (
      mime !== value.mimeType ||
      value.size !== value.blob.size ||
      !value.projectId ||
      !value.assetId
    )
      throw new Error("Dữ liệu ảnh hoặc video không hợp lệ.");
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
  // Deletes every binary owned by one project (keys are [projectId, assetId]).
  async removeProject(projectId: string) {
    await this.request("readwrite", (store) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if ((entry.primaryKey as [string, string])[0] === projectId)
          entry.delete();
        entry.continue();
      };
      return cursor;
    });
  }
}
export const localMediaStore = new LocalMediaAssetStore();
