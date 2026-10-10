import { expect, it } from "vitest";
import { imagePixels, parsePptx } from "../src/import/pptx/parse";
import { analyzeDeck, type DraftPage } from "../src/import/pptx/analyze";
import { buildLessonFromPptx } from "../src/import/pptx/build";
import {
  buildPptx,
  picture,
  pngBytes,
  pngOfSize,
  text,
} from "./support/pptxFixture";

const img = (n: number) => ({
  type: "image",
  target: `../media/image${n}.png`,
});
const page = (pages: DraftPage[], slide = 1) => {
  const p = pages.find((x) => x.slide === slide);
  if (p?.kind !== "PAGE") throw new Error(`slide ${slide} is not a page`);
  return p;
};

it("reads picture sizes from PNG, GIF and JPEG headers", () => {
  expect(imagePixels(pngOfSize(640, 480, 40))).toEqual({
    width: 640,
    height: 480,
  });
  expect(
    imagePixels(new Uint8Array([71, 73, 70, 56, 57, 97, 32, 1, 200, 0, 0, 0])),
  ).toEqual({ width: 288, height: 200 });
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 1, 44, 2, 88, 3,
    0, 0,
  ]);
  expect(imagePixels(jpeg)).toEqual({ width: 600, height: 300 });
  expect(imagePixels(new Uint8Array([1, 2, 3]))).toBeUndefined();
});

