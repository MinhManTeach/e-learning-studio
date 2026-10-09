// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import type { AssetReference } from "../src/model/schema";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import {
  ImageResolverContext,
  missingPackagedImage,
  packagedImageResolver,
} from "../src/media/imageResolver";

afterEach(cleanup);

const localAsset: AssetReference = {
  id: "pic-1",
  kind: "IMAGE",
  sourceType: "UPLOAD",
  name: "Tư thế ngồi",
  fileName: "tu-the.png",
  mimeType: "image/png",
  url: "local-media:pic-1",
  altText: "Học sinh ngồi thẳng lưng",
  status: "LOCAL",
};

function lessonWith(asset: AssetReference) {
  const p = createProject();
  const s = createSlide("content");
  s.layout = "TEXT_LEFT_MEDIA_RIGHT";
  s.media = { ...s.media, enabled: true, assetId: asset.id };
  p.slides = [s];
  p.assets = [asset];
  return p;
}

it("shows a packaged image from its file inside the unzipped package", () => {
  const p = lessonWith(localAsset);
  const resolver = packagedImageResolver(
    { "pic-1": "media/0001.png" },
    "file:///C:/bai-giang/index.html",
  );
  render(
    <ImageResolverContext.Provider value={resolver}>
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  const img = screen.getByRole("img", { name: "Học sinh ngồi thẳng lưng" });
  expect(img.getAttribute("src")).toBe("file:///C:/bai-giang/media/0001.png");
});

it("says the package is missing the image instead of showing a broken one", () => {
  const p = lessonWith(localAsset);
  render(
    <ImageResolverContext.Provider
      value={packagedImageResolver({}, "https://lms.example/sco/index.html")}
    >
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  expect(screen.getAllByRole("alert")[0].textContent).toBe(
    missingPackagedImage,
  );
  expect(screen.queryByRole("img")).toBeNull();
});

it("keeps external HTTPS images on their original address", () => {
  const p = lessonWith({
    ...localAsset,
    status: "EXTERNAL",
    sourceType: "URL",
    url: "https://upload.wikimedia.org/a.png",
  });
  render(
    <ImageResolverContext.Provider
      value={packagedImageResolver({}, "file:///C:/bai-giang/index.html")}
    >
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "https://upload.wikimedia.org/a.png",
  );
});

it("does not let a teacher-typed file: address through", () => {
  const p = lessonWith({
    ...localAsset,
    status: "EXTERNAL",
    sourceType: "URL",
    url: "file:///C:/Windows/secret.png",
  });
  render(
    <ImageResolverContext.Provider
      value={packagedImageResolver({}, "file:///C:/bai-giang/index.html")}
    >
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  expect(screen.queryByRole("img")).toBeNull();
});

it("plays a packaged lesson video with controls", () => {
  const p = lessonWith({
    ...localAsset,
    id: "clip",
    kind: "VIDEO",
    mimeType: "video/mp4",
    altText: "Buổi học đầu tiên của Khoa",
  });
  const { container } = render(
    <ImageResolverContext.Provider
      value={packagedImageResolver(
        { clip: "media/video-0001.mp4" },
        "https://lms.example/sco/index.html",
      )}
    >
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  const video = container.querySelector("video")!;
  expect(video.getAttribute("src")).toBe(
    "https://lms.example/sco/media/video-0001.mp4",
  );
  expect(video.hasAttribute("controls")).toBe(true);
  expect(video.getAttribute("aria-label")).toBe("Buổi học đầu tiên của Khoa");
  expect(screen.queryByRole("img")).toBeNull();
});
