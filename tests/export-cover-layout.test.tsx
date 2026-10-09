// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import type { AssetReference, Slide } from "../src/model/schema";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import {
  ImageResolverContext,
  packagedImageResolver,
} from "../src/media/imageResolver";

afterEach(cleanup);

const slidePicture: AssetReference = {
  id: "slide-4",
  kind: "IMAGE",
  sourceType: "UPLOAD",
  name: "Slide 4",
  fileName: "slide-4.png",
  mimeType: "image/png",
  url: "local-media:slide-4",
  altText: "Trò chơi Ai nhanh – Ai đúng với các bộ phận máy tính",
  status: "LOCAL",
};
function show(slide: Slide, files: Record<string, string>) {
  const p = createProject();
  slide.layout = "MEDIA_COVER";
  slide.media = { ...slide.media, enabled: true, assetId: slidePicture.id };
  p.slides = [slide];
  p.assets = [slidePicture];
  return render(
    <ImageResolverContext.Provider
      value={packagedImageResolver(files, "https://lms.example/sco/")}
    >
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
}

it("fills the page with the teacher's slide picture and keeps the text for read-aloud", () => {
  const s = createSlide("content");
  s.title = "Tư thế ngồi đúng";
  s.data.bulletPoints = ["Mắt cách màn hình 50 – 80 cm."];
  const { container } = show(s, { "slide-4": "media/0001.png" });
  expect(container.querySelector("article")?.className).toContain("cover");
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "https://lms.example/sco/media/0001.png",
  );
  const title = screen.getByRole("heading", { level: 1 });
  expect(title.textContent).toBe("Tư thế ngồi đúng");
  expect(title.className).toBe("visually-hidden");
  expect(container.textContent).toContain("Mắt cách màn hình 50 – 80 cm.");
});

it("never covers a quiz: the questions stay visible beside the picture", () => {
  const { container } = show(createSlide("quiz"), {
    "slide-4": "media/0001.png",
  });
  expect(container.querySelector("article")?.className).not.toContain("cover");
  expect(
    container.querySelector("[data-layout]")?.getAttribute("data-layout"),
  ).toBe("MEDIA_FULL");
  expect(screen.getByRole("heading", { level: 1 }).className).toBe("");
});

it("falls back to readable text when the slide picture is missing", () => {
  const s = createSlide("content");
  s.title = "Tư thế ngồi đúng";
  const { container } = show(s, {});
  expect(container.querySelector("article")?.className).not.toContain("cover");
  expect(screen.getByRole("heading", { level: 1 }).className).toBe("");
});
