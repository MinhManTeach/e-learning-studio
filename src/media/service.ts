import {
  assetSchema,
  parseProject,
  type LessonProject,
  type Slide,
  type AssetReference,
} from "../model/schema";
import {
  isReusableLicense,
  mediaCandidateSchema,
  type MediaCandidate,
  type MediaSourceMetadata,
  type MediaStatus,
} from "./model";
import {
  LocalMediaAssetStore,
  localMediaStore,
  maxImageBytes,
  validateImageBlob,
} from "./storage";
export function localAssetPath(id: string) {
  return `local-media:${id}`;
}
export function jsonMediaWarning(project: LessonProject) {
  return project.assets.some((a) => a.status === "LOCAL")
    ? "JSON chỉ chứa tham chiếu ảnh; không sao lưu binary ảnh trên thiết bị. Mở trên trình duyệt khác có thể thiếu ảnh."
    : null;
}
export function chooseMediaLayout(slide: Slide) {
  return slide.layout === "TEXT_ONLY" || slide.layout === "CENTERED"
    ? ("TEXT_LEFT_MEDIA_RIGHT" as const)
    : slide.layout;
}
export function attachMedia(
  project: LessonProject,
  slideId: string,
  asset: AssetReference,
  caption: string,
) {
  if (!project.slides.some((s) => s.id === slideId))
    throw new Error("Trang đã bị xóa. Hãy chọn trang khác.");
  const validated = assetSchema.parse(asset);
  return parseProject({
    ...project,
    assets: [...project.assets.filter((a) => a.id !== validated.id), validated],
    slides: project.slides.map((s) =>
      s.id === slideId
        ? {
            ...s,
            layout: chooseMediaLayout(s),
            media: {
              ...s.media,
              enabled: true,
              assetId: validated.id,
              caption,
            },
          }
        : s,
    ),
  });
}
export class MediaSelectionService {
  constructor(
    readonly store: LocalMediaAssetStore = localMediaStore,
    private request: typeof fetch = (...args) => fetch(...args),
  ) {}
  async select(
    candidate: MediaCandidate,
    projectId: string,
    alt: string,
    signal?: AbortSignal,
  ) {
    const value = mediaCandidateSchema.parse(candidate);
    if (!isReusableLicense(value.license))
      throw new Error(
        "Giấy phép chưa rõ hoặc không tương thích. Không thể dùng ảnh này.",
      );
    if (
      !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(
        new URL(value.downloadUrl).hostname,
      )
    )
      throw new Error("Nguồn tải ảnh không được hỗ trợ.");
    const response = await this.request(value.downloadUrl, {
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > maxImageBytes
    )
      throw new Error(
        "Không tải được binary ảnh hợp lệ. Hãy tải ảnh của thầy/cô.",
      );
    // Bound the stream too: Content-Length may be absent or inaccurate.
    const reader = response.body?.getReader();
    let blob: Blob;
    if (reader) {
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          signal?.throwIfAborted();
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxImageBytes)
            throw new Error("Ảnh tải về vượt quá 8 MB. Hãy chọn ảnh nhỏ hơn.");
          chunks.push(new Uint8Array(part.value));
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      blob = new Blob(chunks, {
        type: response.headers.get("content-type")?.split(";")[0] ?? "",
      });
    } else blob = await response.blob();
    signal?.throwIfAborted();
    return this.storeImage(
      blob,
      projectId,
      alt,
      {
        title: value.title,
        provider: value.provider,
        sourceUrl: value.sourceUrl,
        creator: value.creator,
        license: value.license,
        licenseUrl: value.licenseUrl,
        attribution: value.attribution,
      },
      signal,
    );
  }
  async upload(
    file: File,
    projectId: string,
    alt: string,
    signal?: AbortSignal,
  ) {
    return this.storeImage(
      file,
      projectId,
      alt,
      {
        title: file.name,
        provider: "UPLOAD",
        sourceUrl: "",
        creator: "Giáo viên cung cấp",
        license: "USER_PROVIDED",
        licenseUrl: "",
        attribution:
          "Ảnh do giáo viên cung cấp; giáo viên xác nhận quyền sử dụng.",
      },
      signal,
    );
  }
  private async storeImage(
    blob: Blob,
    projectId: string,
    alt: string,
    source: MediaSourceMetadata,
    signal?: AbortSignal,
  ) {
    const mimeType = await validateImageBlob(blob);
    signal?.throwIfAborted();
    if (typeof createImageBitmap === "function") {
      let decoded: ImageBitmap;
      try {
        decoded = await createImageBitmap(blob);
      } catch {
        throw new Error(
          "Không giải mã được ảnh. Hãy chọn một ảnh PNG/JPEG/WebP hợp lệ.",
        );
      }
      const pixels = decoded.width * decoded.height;
      decoded.close();
      if (pixels > 24000000)
        throw new Error(
          "Ảnh có độ phân giải quá lớn; tối đa 24 triệu điểm ảnh.",
        );
    }
    const assetId = crypto.randomUUID();
    await this.store.put({
      assetId,
      projectId,
      blob,
      mimeType,
      size: blob.size,
      source,
    });
    signal?.throwIfAborted();
    return {
      asset: assetSchema.parse({
        id: assetId,
        kind: "IMAGE",
        sourceType: source.provider === "UPLOAD" ? "UPLOAD" : "LIBRARY",
        name: source.title,
        fileName: source.provider === "UPLOAD" ? source.title : "",
        mimeType,
        size: blob.size,
        url: localAssetPath(assetId),
        altText: alt.trim() || source.title,
        status: "LOCAL",
      }),
      caption: [source.attribution, source.sourceUrl, source.licenseUrl]
        .filter(Boolean)
        .join(" · "),
    };
  }
}
export class MediaReadinessValidator {
  constructor(private store: LocalMediaAssetStore = localMediaStore) {}
  async status(project: LessonProject, slide: Slide): Promise<MediaStatus> {
    const asset = project.assets.find((a) => a.id === slide.media.assetId);
    if (!slide.media.enabled) return "NEEDS_MEDIA";
    if (!asset) return "MISSING";
    if (asset.status !== "LOCAL")
      return asset.url ? "EXTERNAL_DEPENDENCY" : "NEEDS_MEDIA";
    return (await this.store.get(asset.id, project.projectId))
      ? "STORED"
      : "MISSING";
  }
}
