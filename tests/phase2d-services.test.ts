import { describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { WikimediaCommonsProvider } from "../src/media/provider";
import { MediaIntentAnalyzer } from "../src/media/intent";
import {
  MediaSelectionService,
  MediaReadinessValidator,
  attachMedia,
  jsonMediaWarning,
} from "../src/media/service";
import { LocalMediaAssetStore, maxImageBytes } from "../src/media/storage";
import { mediaCandidateSchema, plainMetadata } from "../src/media/model";
import { createProject } from "../src/model/factories";
import { editorReducer, editorState } from "../src/editor/reducer";
import { exportProjectJSON } from "../src/model/json";

export const candidate = {
  id: "1",
  provider: "WIKIMEDIA_COMMONS" as const,
  title: "Children using computers",
  creator: "Author",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attribution: "Author · CC BY-SA 4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Children.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
  downloadUrl: "https://upload.wikimedia.org/image.jpg",
  mimeType: "image/png" as const,
};
const png = () =>
  new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], {
    type: "image/png",
  });
const store = () =>
  new LocalMediaAssetStore(new IDBFactory(), crypto.randomUUID());
const result = {
  query: {
    pages: {
      "1": {
        pageid: 1,
        title: "File:Children.jpg",
        imageinfo: [
          {
            thumburl: candidate.thumbnailUrl,
            url: candidate.downloadUrl,
            descriptionurl: candidate.sourceUrl,
            mime: "image/png",
            extmetadata: {
              Artist: { value: "<a>Author</a>" },
              LicenseShortName: { value: candidate.license },
              LicenseUrl: { value: candidate.licenseUrl },
            },
          },
        ],
      },
    },
  },
};
describe("Phase 2D provider contract", () => {
  it("requests the documented CORS API and retains license/credit", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(result)));
    const provider = new WikimediaCommonsProvider(request);
    const results = await provider.search("children computer");
    const url = new URL(String(request.mock.calls[0][0]));
    expect(url.searchParams.get("origin")).toBe("*");
    expect(url.searchParams.get("gsrnamespace")).toBe("6");
    expect(results[0]).toMatchObject({
      creator: "Author",
      license: candidate.license,
      licenseUrl: candidate.licenseUrl,
    });
    results[0].title = "mutated";
    expect((await provider.search("children computer"))[0].title).not.toBe(
      "mutated",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("reports HTTP and API failures", async () => {
    await expect(
      new WikimediaCommonsProvider(
        vi.fn().mockResolvedValue(new Response("", { status: 503 })),
      ).search("x"),
    ).rejects.toThrow("503");
    await expect(
      new WikimediaCommonsProvider(
        vi.fn().mockResolvedValue(new Response('{"error":{}}')),
      ).search("x"),
    ).rejects.toThrow();
  });
  it("returns genuinely empty results without placeholders", async () => {
    expect(
      await new WikimediaCommonsProvider(
        vi.fn().mockResolvedValue(new Response("{}")),
      ).search("x"),
    ).toEqual([]);
  });
  it("cancels before making requests and after response parsing", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn();
    await expect(
      new WikimediaCommonsProvider(request).search("x", controller.signal),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    const late = new AbortController();
    const provider = new WikimediaCommonsProvider(
      vi.fn().mockImplementation(async () => {
        late.abort();
        return new Response(JSON.stringify(result));
      }),
    );
    await expect(provider.search("x", late.signal)).rejects.toThrow();
  });
  it("rejects unsafe candidate links and removes metadata markup", () => {
    expect(
      mediaCandidateSchema.safeParse({
        ...candidate,
        sourceUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      mediaCandidateSchema.safeParse({
        ...candidate,
        mimeType: "image/svg+xml",
      }).success,
    ).toBe(false);
    expect(plainMetadata('<img onerror="alert(1)">Hello &amp; world')).toBe(
      "Hello & world",
    );
  });
});
describe("Phase 2D contextual intent", () => {
  it("does not mistake the next metadata line for empty search keywords", () => {
    const project = createProject();
    const slide = project.slides[1];
    slide.media.suggestion =
      "Từ khóa: \nMô tả thay thế: Học sinh dùng máy tính";
    const intent = new MediaIntentAnalyzer().analyze(project, slide);
    expect(intent.queries[0]).not.toContain("Mô tả thay thế");
    expect(intent.queries[0]).toContain(slide.title);
  });
  it("uses content, purpose, intent, stage, learner age and adjacent context", () => {
    const project = createProject();
    project.metadata.grade = "4";
    const slide = project.slides[1];
    slide.title = "Chọn thông tin phù hợp";
    slide.teacherNotes = "Mục đích: kiểm chứng nguồn thông tin";
    slide.media.suggestion = "Từ khóa: học sinh kiểm tra thông tin";
    slide.pedagogicalStage = "PRACTICE";
    const intent = new MediaIntentAnalyzer().analyze(project, slide);
    expect(intent.queries[0]).toBe("học sinh kiểm tra thông tin");
    expect(intent.queries[1]).toContain("reliable");
    expect(intent.learnerAge).toBe(9);
    expect(intent.neighborTitles).toContain(project.slides[0].title);
    expect(intent.pedagogicalPurpose).toContain("kiểm chứng");
    expect(intent.content).toBe(JSON.stringify(slide.data));
    expect(intent.stage).toBe("PRACTICE");
  });
  it("distinguishes responsible AI from ordinary information search", () => {
    const project = createProject();
    const slide = project.slides[0];
    slide.title = "Con người chịu trách nhiệm khi sử dụng AI";
    const ai = new MediaIntentAnalyzer().analyze(project, slide).queries;
    slide.title = "Tìm kiếm thông tin bằng từ khóa";
    const information = new MediaIntentAnalyzer().analyze(
      project,
      slide,
    ).queries;
    expect(ai[1]).toContain("human decision");
    expect(information[1]).toContain("search engine");
    expect(ai).not.toEqual(information);
  });
});
describe("Phase 2D selection and canonical ownership", () => {
  it("stores actual downloaded binary before returning a LOCAL reference and credit", async () => {
    const storage = store();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(png(), { headers: { "content-type": "image/png" } }),
      );
    const selected = await new MediaSelectionService(storage, request).select(
      candidate,
      "p",
      "Học sinh tìm thông tin",
    );
    expect(selected.asset.status).toBe("LOCAL");
    expect(selected.asset.url).toBe(`local-media:${selected.asset.id}`);
    expect(selected.asset.altText).toBe("Học sinh tìm thông tin");
    expect(selected.caption).toContain(candidate.sourceUrl);
    expect((await storage.get(selected.asset.id, "p"))?.source.licenseUrl).toBe(
      candidate.licenseUrl,
    );
  });
  it("blocks unknown licenses, hostile hosts, bad MIME and network failure", async () => {
    const request = vi.fn();
    const service = new MediaSelectionService(store(), request);
    await expect(
      service.select({ ...candidate, license: "Unknown" }, "p", "alt"),
    ).rejects.toThrow("Giấy phép");
    await expect(
      service.select(
        { ...candidate, downloadUrl: "https://evil.example/a.png" },
        "p",
        "alt",
      ),
    ).rejects.toThrow("Nguồn");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(
      new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    );
    await expect(service.select(candidate, "p", "alt")).rejects.toThrow();
    request.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(service.select(candidate, "p", "alt")).rejects.toThrow(
      "Failed to fetch",
    );
  });
  it("rejects oversize streams without Content-Length", async () => {
    const service = new MediaSelectionService(
      store(),
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(maxImageBytes + 1), {
          headers: { "content-type": "image/png" },
        }),
      ),
    );
    await expect(service.select(candidate, "p", "alt")).rejects.toThrow("8 MB");
  });
  it("manual upload works without invoking the network", async () => {
    const request = vi.fn();
    const selected = await new MediaSelectionService(store(), request).upload(
      new File([png()], "teacher.png", { type: "image/png" }),
      "p",
      "alt",
    );
    expect(selected.asset.sourceType).toBe("UPLOAD");
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects corrupt decoded images and excessive resolution before storage", async () => {
    const storage = store();
    const put = vi.spyOn(storage, "put");
    const service = new MediaSelectionService(storage);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("invalid PNG")),
    );
    try {
      await expect(
        service.upload(
          new File([png()], "bad.png", { type: "image/png" }),
          "p",
          "alt",
        ),
      ).rejects.toThrow("giải mã");
      const close = vi.fn();
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue({ width: 6000, height: 6000, close }),
      );
      await expect(
        service.upload(
          new File([png()], "big.png", { type: "image/png" }),
          "p",
          "alt",
        ),
      ).rejects.toThrow("24 triệu");
      expect(close).toHaveBeenCalledOnce();
      expect(put).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps existing teacher-selected media layouts", async () => {
    const project = createProject();
    project.slides[1].layout = "MEDIA_LEFT_TEXT_RIGHT";
    const selected = await new MediaSelectionService(store()).upload(
      new File([png()], "a.png", { type: "image/png" }),
      project.projectId,
      "alt",
    );
    expect(
      attachMedia(project, project.slides[1].id, selected.asset, "").slides[1]
        .layout,
    ).toBe("MEDIA_LEFT_TEXT_RIGHT");
  });
  it("never attaches a cancelled download", async () => {
    const controller = new AbortController();
    controller.abort();
    const service = new MediaSelectionService(
      store(),
      vi
        .fn()
        .mockResolvedValue(
          new Response(png(), { headers: { "content-type": "image/png" } }),
        ),
    );
    await expect(
      service.select(candidate, "p", "alt", controller.signal),
    ).rejects.toThrow();
  });
  it("attaches only the target, preserves shared images on replacement, and preserves LOCAL on alt edit", async () => {
    const storage = store();
    const project = createProject();
    const service = new MediaSelectionService(storage);
    const first = await service.upload(
      new File([png()], "a.png", { type: "image/png" }),
      project.projectId,
      "first",
    );
    let attached = attachMedia(
      project,
      project.slides[0].id,
      first.asset,
      first.caption,
    );
    attached = attachMedia(
      attached,
      project.slides[1].id,
      first.asset,
      first.caption,
    );
    const second = await service.upload(
      new File([png()], "b.png", { type: "image/png" }),
      project.projectId,
      "second",
    );
    const reduced = editorReducer(editorState(attached), {
      type: "attach-media",
      id: project.slides[0].id,
      ...second,
    });
    expect(reduced.project.slides[1].media.assetId).toBe(first.asset.id);
    expect(await storage.get(first.asset.id, project.projectId)).toBeDefined();
    expect(reduced.project.slides[0].layout).toBe("TEXT_LEFT_MEDIA_RIGHT");
    const edited = editorReducer(reduced, {
      type: "media",
      id: project.slides[0].id,
      url: second.asset.url,
      alt: "new alt",
    });
    expect(
      edited.project.assets.find((a) => a.id === second.asset.id),
    ).toMatchObject({ status: "LOCAL", altText: "new alt" });
    expect(jsonMediaWarning(edited.project)).toContain("không sao lưu binary");
    const exported = exportProjectJSON(edited.project);
    expect(exported).toContain("local-media:");
    expect(exported).not.toContain("base64");
    expect(exported).not.toContain("blob:");
  });
  it("distinguishes missing, stored, external, disabled and rejects removed slide attachment", async () => {
    const storage = store();
    const project = createProject();
    const slide = project.slides[0];
    const readiness = new MediaReadinessValidator(storage);
    expect(await readiness.status(project, slide)).toBe("NEEDS_MEDIA");
    const selection = await new MediaSelectionService(storage).upload(
      new File([png()], "a.png", { type: "image/png" }),
      project.projectId,
      "alt",
    );
    const attached = attachMedia(project, slide.id, selection.asset, "");
    expect(await readiness.status(attached, attached.slides[0])).toBe("STORED");
    await storage.remove(selection.asset.id, project.projectId);
    expect(await readiness.status(attached, attached.slides[0])).toBe(
      "MISSING",
    );
    attached.assets[0].status = "EXTERNAL";
    attached.assets[0].url = "https://example.com/x.png";
    expect(await readiness.status(attached, attached.slides[0])).toBe(
      "EXTERNAL_DEPENDENCY",
    );
    expect(() => attachMedia(project, "deleted", selection.asset, "")).toThrow(
      "xóa",
    );
    expect(jsonMediaWarning(project)).toBeNull();
  });
});
