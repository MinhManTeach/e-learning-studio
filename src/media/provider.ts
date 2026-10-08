import {
  mediaCandidateSchema,
  plainMetadata,
  type MediaCandidate,
  type MediaSearchProvider,
} from "./model";
type ImageInfo = {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
};
export class WikimediaCommonsProvider implements MediaSearchProvider {
  readonly id = "wikimedia-commons";
  private cache = new Map<string, { at: number; items: MediaCandidate[] }>();
  constructor(private request: typeof fetch = (...args) => fetch(...args)) {}
  async search(query: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const key = query.trim().slice(0, 300);
    if (!key) throw new Error("Nhập từ khóa tìm hình ảnh.");
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 120000)
      return structuredClone(cached.items);
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: `${key} filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "960",
    }).toString();
    const response = await this.request(url, {
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(
        `Nguồn ảnh trả lỗi HTTP ${response.status}. Thử lại hoặc tải ảnh của thầy/cô.`,
      );
    const data = (await response.json()) as {
      error?: unknown;
      query?: {
        pages?: Record<
          string,
          { pageid: number; title: string; imageinfo?: ImageInfo[] }
        >;
      };
    };
    if (data.error)
      throw new Error(
        "Nguồn ảnh không xử lý được yêu cầu. Thử từ khóa khác hoặc tải ảnh.",
      );
    const candidates: MediaCandidate[] = [];
    for (const page of Object.values(data.query?.pages ?? {})) {
      const image = page.imageinfo?.[0];
      if (!image) continue;
      const meta = (name: string) =>
        plainMetadata(image.extmetadata?.[name]?.value ?? "");
      const title =
        meta("ImageDescription") ||
        plainMetadata(page.title.replace(/^File:/, ""));
      const creator = meta("Artist"),
        license = meta("LicenseShortName") || "Chưa rõ giấy phép";
      const licenseUrl = image.extmetadata?.LicenseUrl?.value ?? "";
      const parsed = mediaCandidateSchema.safeParse({
        id: String(page.pageid),
        provider: "WIKIMEDIA_COMMONS",
        title,
        thumbnailUrl: image.thumburl ?? image.url,
        downloadUrl: image.thumburl ?? image.url,
        sourceUrl: image.descriptionurl,
        creator,
        license,
        licenseUrl,
        attribution: [
          creator,
          title,
          license,
          meta("Attribution"),
          meta("UsageTerms"),
        ]
          .filter(Boolean)
          .join(" · "),
        mimeType: image.mime,
      });
      if (
        parsed.success &&
        [parsed.data.thumbnailUrl, parsed.data.downloadUrl].every((value) =>
          ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(
            new URL(value).hostname,
          ),
        )
      )
        candidates.push(parsed.data);
    }
    signal?.throwIfAborted();
    if (this.cache.size >= 30)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), items: candidates });
    return structuredClone(candidates);
  }
}
