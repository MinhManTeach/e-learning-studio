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

it("chooses the drawing, not panels with text on them, frames around a picture or flat shapes", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "THỰC HÀNH - NHIỆM VỤ 2", { x: 32, y: 5, w: 42, h: 7 }),
            // Title bar behind the heading (detailed, but mostly covered by text).
            picture(3, "rId1", { x: 23, y: 3, w: 55, h: 12 }),
            // Big panel holding the step text.
            picture(4, "rId2", { x: 5, y: 30, w: 40, h: 60 }),
            text(5, "BƯỚC 1: Nhấn nút công tắc", { x: 8, y: 40, w: 34, h: 30 }),
            // Frame with the real drawing inside it.
            picture(6, "rId3", { x: 52, y: 30, w: 40, h: 60 }),
            picture(7, "rId4", { x: 56, y: 36, w: 30, h: 45 }),
            // Large flat rounded rectangle (very few bytes per pixel).
            picture(8, "rId5", { x: 0, y: 92, w: 100, h: 8 }),
            picture(9, "rId5", { x: 30, y: 20, w: 20, h: 70 }),
          ],
          rels: {
            rId1: img(1),
            rId2: img(2),
            rId3: img(3),
            rId4: img(4),
            rId5: img(5),
          },
        },
      ],
      {
        "image1.png": pngOfSize(100, 20, 1400),
        "image2.png": pngOfSize(100, 100, 3000),
        "image3.png": pngOfSize(100, 100, 3000),
        "image4.png": pngOfSize(100, 100, 8000),
        "image5.png": pngOfSize(100, 100, 1000),
      },
    ),
  );
  expect(page(analyzeDeck(deck).pages).picture).toBe("ppt/media/image4.png");
});

it("keeps a labelled drawing even though a few labels sit on it", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "HOẠT ĐỘNG 1: KHỞI ĐỘNG", { x: 10, y: 4, w: 50, h: 8 }),
            text(3, "Lưng thẳng, vai thả lỏng.", { x: 5, y: 30, w: 40, h: 8 }),
            picture(4, "rId1", { x: 55, y: 27, w: 32, h: 65 }),
            text(5, "50 – 80 cm", { x: 67, y: 33, w: 8, h: 4 }),
          ],
          rels: { rId1: img(1) },
        },
      ],
      { "image1.png": pngOfSize(600, 700, 300000) },
    ),
  );
  expect(page(analyzeDeck(deck).pages).picture).toBe("ppt/media/image1.png");
});

it("shows a slide that is only a picture as a cover page", () => {
  const bytes = buildPptx(
    [
      {
        shapes: [
          picture(2, "rId1", { x: 0, y: 0, w: 100, h: 100 }),
          picture(3, "rId2", { x: 1, y: 4, w: 64, h: 85 }),
          picture(4, "rId1", { x: 90, y: 2, w: 8, h: 10 }),
        ],
        rels: { rId1: img(1), rId2: img(2) },
      },
    ],
    { "image1.png": pngBytes, "image2.png": pngOfSize(1200, 900, 250000) },
  );
  const { pages } = analyzeDeck(parsePptx(bytes));
  expect(page(pages)).toMatchObject({
    title: "Trang 1",
    text: [],
    picture: "ppt/media/image2.png",
    cover: true,
  });
  const { project } = buildLessonFromPptx({
    title: "Bài",
    subject: "",
    grade: "",
    pages,
    pptx: bytes,
    slidePictures: [],
  });
  expect(project.slides[0].layout).toBe("MEDIA_COVER");
});
