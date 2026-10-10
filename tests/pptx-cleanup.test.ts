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

it("joins lines PowerPoint wrapped, reads rows left to right and drops repeated labels", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "5 THAO TÁC CƠ BẢN VỚI CHUỘT", {
              x: 25,
              y: 3,
              w: 43,
              h: 10,
            }),
            // One row of step boxes; the right-most starts slightly higher.
            text(3, ["5. Kéo thả:", "Nhấn giữ nút trái", "+ di chuyển."], {
              x: 80,
              y: 63,
              w: 14,
              h: 16,
            }),
            text(4, ["1. Di chuyển:", "Thay đổi vị trí."], {
              x: 8,
              y: 65,
              w: 11,
              h: 11,
            }),
            text(5, ["2. Nháy chuột:", "Nhấn nút trái", "1 lần."], {
              x: 26,
              y: 66,
              w: 12,
              h: 11,
            }),
            text(6, "Mắt cách màn hình 50 – 80 cm.", {
              x: 10,
              y: 80,
              w: 40,
              h: 6,
            }),
            text(7, "50 – 80 cm", { x: 60, y: 82, w: 8, h: 4 }),
            text(8, ["Ngồi thẳng lưng,", "vai thả lỏng."], {
              x: 10,
              y: 88,
              w: 30,
              h: 6,
            }),
            text(
              9,
              [
                "Cầm chuột bằng TAY PHẢI:",
                "(1) Ngón trỏ: nút trái.",
                "(2) Ngón giữa: nút phải.",
                "Ghi nhớ:",
              ],
              {
                x: 50,
                y: 88,
                w: 40,
                h: 10,
              },
            ),
          ],
        },
      ],
      {},
    ),
  );
  expect(page(analyzeDeck(deck).pages).text).toEqual([
    "1. Di chuyển: Thay đổi vị trí.",
    "2. Nháy chuột: Nhấn nút trái 1 lần.",
    "5. Kéo thả: Nhấn giữ nút trái + di chuyển.",
    "Mắt cách màn hình 50 – 80 cm.",
    "Ngồi thẳng lưng, vai thả lỏng.",
    "Cầm chuột bằng TAY PHẢI:",
    "(1) Ngón trỏ: nút trái.",
    "(2) Ngón giữa: nút phải.",
    "Ghi nhớ:",
  ]);
});

