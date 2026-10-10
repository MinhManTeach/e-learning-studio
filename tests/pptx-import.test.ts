import { expect, it } from "vitest";
import { parsePptx, PptxError, readPptxParts } from "../src/import/pptx/parse";
import { analyzeDeck, isWatermark } from "../src/import/pptx/analyze";
import {
  buildPptx,
  group,
  mp4Bytes,
  picture,
  pngBytes,
  text,
  wavBytes,
} from "./support/pptxFixture";

const media = {
  "image1.png": pngBytes,
  "image2.png": pngBytes,
  "image3.png": pngBytes,
  "media1.mp4": mp4Bytes,
  "dung.wav": wavBytes,
  "sai.wav": wavBytes,
};
const img = (n: number) => ({
  type: "image",
  target: `../media/image${n}.png`,
});

it("reads slides in order with text, pictures, videos, links, triggers and notes", () => {
  const bytes = buildPptx(
    [
      {
        shapes: [
          text(
            2,
            "Bài 4. Làm việc với máy tính",
            { x: 10, y: 5, w: 80, h: 10 },
            { title: true },
          ),
          group({ x: 50, y: 50, w: 50, h: 50 }, [
            picture(3, "rId1", { x: 0, y: 0, w: 100, h: 100 }),
          ]),
        ],
        rels: { rId1: img(1) },
        notes: "Giới thiệu bài học",
      },
      {
        hidden: true,
        shapes: [
          picture(
            4,
            "rId1",
            { x: 10, y: 10, w: 80, h: 80 },
            {
              media: { rId: "rId2", kind: "video" },
            },
          ),
          text(5, "Tiếp tục", { x: 0, y: 90, w: 20, h: 8 }, { jump: "rId3" }),
        ],
        rels: {
          rId1: img(2),
          rId2: { type: "video", target: "../media/media1.mp4" },
          rId3: { type: "slide", target: "slide1.xml" },
        },
        triggers: { "5": ["4"] },
      },
    ],
    media,
  );
  const deck = parsePptx(bytes);
  expect(deck.slides.map((s) => s.number)).toEqual([1, 2]);
  const [first, second] = deck.slides;
  expect(first.elements[0]).toMatchObject({
    text: ["Bài 4. Làm việc với máy tính"],
    placeholder: "title",
  });
  // Group coordinates are mapped back onto the slide.
  expect(first.elements[1].rect!.x / deck.width).toBeCloseTo(0.5);
  expect(first.elements[1].rect!.w / deck.width).toBeCloseTo(0.5);
  expect(first.elements[1].image).toBe("ppt/media/image1.png");
  expect(first.notes).toEqual(["Giới thiệu bài học"]);
  expect(second.hidden).toBe(true);
  expect(second.elements[0].media).toEqual({
    path: "ppt/media/media1.mp4",
    kind: "VIDEO",
  });
  expect(second.elements[1].jump).toBe(1);
  expect(second.triggers).toEqual([{ trigger: "5", targets: ["4"] }]);
  expect(deck.media["ppt/media/media1.mp4"]).toEqual({
    kind: "VIDEO",
    size: mp4Bytes.length,
  });
  expect(readPptxParts(bytes, ["ppt/media/media1.mp4"])).toEqual({
    "ppt/media/media1.mp4": mp4Bytes,
  });
});

it("refuses files that are not PowerPoint", () => {
  expect(() => parsePptx(new Uint8Array([1, 2, 3]))).toThrow(PptxError);
});

it("recognises the NotebookLM watermark in all its spellings", () => {
  for (const w of [
    "Notebook.LM",
    "NotebookL.M",
    "NotebookİM",
    "Notebook<LM",
    "@NotebookL.M",
    "NotebookıM",
    "NotebookLI.M",
  ])
    expect(isWatermark(w)).toBe(true);
  expect(isWatermark("Notebook của em")).toBe(false);
});

const sounds = {
  rIdOk: { type: "audio", target: "../media/dung.wav" },
  rIdNo: { type: "audio", target: "../media/sai.wav" },
  rIdIcon: img(3),
};
const soundShapes = [
  picture(
    30,
    "rIdIcon",
    { x: 101, y: 5, w: 3, h: 5 },
    { name: "dung 2", media: { rId: "rIdOk", kind: "audio" } },
  ),
  picture(
    31,
    "rIdIcon",
    { x: 101, y: 15, w: 3, h: 5 },
    { name: "ÂM THANH TRẢ LỜI SAI", media: { rId: "rIdNo", kind: "audio" } },
  ),
  picture(
    32,
    "rIdIcon",
    { x: 101, y: 25, w: 3, h: 5 },
    { name: "ÂM THANH TRẢ LỜI SAI", media: { rId: "rIdNo", kind: "audio" } },
  ),
];

it("finds the right answer from the sound each option plays, reading text beside letter-only buttons", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "Câu 1: Bộ phận nào dùng để hiển thị kết quả?", {
              x: 10,
              y: 5,
              w: 80,
              h: 10,
            }),
            text(10, "A", { x: 10, y: 40, w: 4, h: 7 }),
            text(11, "Chuột", { x: 20, y: 40, w: 30, h: 7 }),
            text(12, "B", { x: 10, y: 55, w: 4, h: 7 }),
            text(13, "Màn hình", { x: 20, y: 55, w: 30, h: 7 }),
            text(14, "C", { x: 10, y: 70, w: 4, h: 7 }),
            text(15, "Bàn phím", { x: 20, y: 70, w: 30, h: 7 }),
            text(16, "Notebook.LM", { x: 94, y: 97, w: 6, h: 2 }),
            ...soundShapes,
          ],
          rels: sounds,
          triggers: { "10": ["31"], "12": ["30"], "14": ["32"] },
        },
      ],
      media,
    ),
  );
  const { pages } = analyzeDeck(deck);
  expect(pages).toHaveLength(1);
  const page = pages[0];
  if (page.kind !== "QUESTIONS") throw new Error("expected questions");
  expect(page.questions).toEqual([
    {
      prompt: "Bộ phận nào dùng để hiển thị kết quả?",
      options: [{ text: "Chuột" }, { text: "Màn hình" }, { text: "Bàn phím" }],
      correct: [1],
      explanation: "",
      evidence: "SOUNDS",
    },
  ]);
});

it("splits two questions on one slide by their prompts", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "1. Thao tác nào đúng khi tắt máy tính?", {
              x: 10,
              y: 20,
              w: 60,
              h: 6,
            }),
            text(3, "A. Rút phích cắm điện.", { x: 10, y: 35, w: 20, h: 6 }),
            text(4, "B. Chọn Start > Power > Shut down.", {
              x: 40,
              y: 35,
              w: 30,
              h: 6,
            }),
            text(5, "2. Để di chuyển Thùng rác, em dùng thao tác:", {
              x: 10,
              y: 60,
              w: 60,
              h: 6,
            }),
            text(6, "A. Nháy đúp", { x: 10, y: 75, w: 20, h: 6 }),
            text(7, "B. Kéo thả chuột.", { x: 40, y: 75, w: 20, h: 6 }),
            ...soundShapes,
          ],
          rels: sounds,
          triggers: { "3": ["31"], "4": ["30"], "6": ["32"], "7": ["30"] },
        },
      ],
      media,
    ),
  );
  const page = analyzeDeck(deck).pages[0];
  if (page.kind !== "QUESTIONS") throw new Error("expected questions");
  expect(
    page.questions.map((q) => [
      q.prompt,
      q.options.map((o) => o.text),
      q.correct,
    ]),
  ).toEqual([
    [
      "Thao tác nào đúng khi tắt máy tính?",
      ["Rút phích cắm điện.", "Chọn Start > Power > Shut down."],
      [1],
    ],
    [
      "Để di chuyển Thùng rác, em dùng thao tác:",
      ["Nháy đúp", "Kéo thả chuột."],
      [1],
    ],
  ]);
});

it("uses the picture above each answer letter as the answer card picture", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "Tư thế nào sau đây là đúng?", {
              x: 10,
              y: 5,
              w: 80,
              h: 10,
            }),
            picture(20, "rIdA", { x: 10, y: 40, w: 20, h: 30 }),
            picture(21, "rIdB", { x: 60, y: 40, w: 20, h: 30 }),
            text(10, "A", { x: 18, y: 74, w: 4, h: 8 }),
            text(11, "B", { x: 68, y: 74, w: 4, h: 8 }),
            ...soundShapes,
          ],
          rels: { ...sounds, rIdA: img(1), rIdB: img(2) },
          triggers: { "10": ["31"], "11": ["30"] },
        },
      ],
      media,
    ),
  );
  const page = analyzeDeck(deck).pages[0];
  if (page.kind !== "QUESTIONS") throw new Error("expected questions");
  expect(page.questions[0].options).toEqual([
    { text: "A", image: "ppt/media/image1.png" },
    { text: "B", image: "ppt/media/image2.png" },
  ]);
  expect(page.questions[0].correct).toEqual([1]);
});

it("reads game questions from links to CHÍNH XÁC / CHƯA ĐÚNG RỒI slides and skips those slides", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "Câu 2: Mắt nên cách màn hình bao nhiêu?", {
              x: 6,
              y: 19,
              w: 70,
              h: 7,
            }),
            text(
              3,
              "A. 10 – 20 cm",
              { x: 6, y: 35, w: 40, h: 10 },
              { jump: "rIdWrong" },
            ),
            text(
              4,
              "B. 50 – 80 cm",
              { x: 52, y: 35, w: 40, h: 10 },
              { jump: "rIdRight" },
            ),
          ],
          rels: {
            rIdRight: { type: "slide", target: "slide2.xml" },
            rIdWrong: { type: "slide", target: "slide3.xml" },
          },
        },
        {
          shapes: [
            text(2, "✅ CHÍNH XÁC! LẮP THÂN ROBOT", {
              x: 4,
              y: 3,
              w: 40,
              h: 7,
            }),
            text(
              3,
              ["Khoảng cách phù hợp", "từ mắt đến màn hình là 50 – 80 cm."],
              { x: 11, y: 32, w: 49, h: 13 },
            ),
            text(4, "⭐ Robot nhận thêm 1 bộ phận", {
              x: 18,
              y: 51,
              w: 33,
              h: 6,
            }),
            text(
              5,
              "➡ TIẾP TỤC",
              { x: 24, y: 65, w: 22, h: 8 },
              { jump: "rIdBack" },
            ),
          ],
          rels: { rIdBack: { type: "slide", target: "slide1.xml" } },
        },
        {
          shapes: [
            text(2, "❌ CHƯA ĐÚNG RỒI", { x: 4, y: 3, w: 26, h: 7 }),
            text(
              3,
              "🔄 THỬ LẠI CÂU HỎI",
              { x: 17, y: 59, w: 25, h: 8 },
              { jump: "rIdBack" },
            ),
          ],
          rels: { rIdBack: { type: "slide", target: "slide1.xml" } },
        },
      ],
      media,
    ),
  );
  const analysis = analyzeDeck(deck);
  expect(analysis.skipped.map((s) => s.slide)).toEqual([2, 3]);
  const page = analysis.pages[0];
  if (page.kind !== "QUESTIONS") throw new Error("expected questions");
  expect(page.questions[0]).toMatchObject({
    prompt: "Mắt nên cách màn hình bao nhiêu?",
    options: [{ text: "10 – 20 cm" }, { text: "50 – 80 cm" }],
    correct: [1],
    evidence: "LINKS",
    explanation: "Khoảng cách phù hợp từ mắt đến màn hình là 50 – 80 cm.",
  });
});

it("turns video slides into video pages, other slides into pages, and skips hidden slides and menus", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "Quan sát video: Buổi học đầu tiên của Khoa", {
              x: 7,
              y: 2,
              w: 47,
              h: 14,
            }),
            picture(
              3,
              "rId1",
              { x: 14, y: 20, w: 72, h: 72 },
              { media: { rId: "rId2", kind: "video" } },
            ),
          ],
          rels: {
            rId1: img(1),
            rId2: { type: "video", target: "../media/media1.mp4" },
          },
        },
        {
          shapes: [
            text(2, "GHI NHỚ", { x: 10, y: 5, w: 40, h: 10 }),
            text(
              3,
              [
                "Giáo viên: ..............",
                "Chuột có nút trái, nút phải và nút cuộn.",
              ],
              { x: 10, y: 20, w: 50, h: 30 },
            ),
            picture(4, "rId1", { x: 0, y: 0, w: 100, h: 100 }),
            picture(5, "rId2", { x: 60, y: 30, w: 35, h: 50 }),
          ],
          rels: { rId1: img(1), rId2: img(2) },
        },
        {
          hidden: true,
          shapes: [text(2, "Slide ẩn", { x: 0, y: 0, w: 50, h: 10 })],
        },
        {
          shapes: [1, 2, 3].map((k) =>
            text(
              10 + k,
              `NHIỆM VỤ ${k}`,
              { x: k * 20, y: 30, w: 15, h: 15 },
              { jump: "rIdS" },
            ),
          ),
          rels: { rIdS: { type: "slide", target: "slide1.xml" } },
        },
      ],
      media,
    ),
  );
  const { pages, skipped, media: used } = analyzeDeck(deck);
  expect(pages).toEqual([
    {
      kind: "VIDEO",
      slide: 1,
      title: "Quan sát video: Buổi học đầu tiên của Khoa",
      video: "ppt/media/media1.mp4",
      notes: [],
    },
    {
      kind: "PAGE",
      slide: 2,
      title: "GHI NHỚ",
      text: ["Chuột có nút trái, nút phải và nút cuộn."],
      notes: [],
      picture: "ppt/media/image2.png",
    },
  ]);
  expect(skipped.map((s) => s.slide)).toEqual([3, 4]);
  expect(used.sort()).toEqual(["ppt/media/image2.png", "ppt/media/media1.mp4"]);
});

it("keeps A./B. questions without any answer evidence for the teacher to mark", () => {
  const deck = parsePptx(
    buildPptx(
      [
        {
          shapes: [
            text(2, "Điều khiển chuột là điều khiển con trỏ. Đúng hay Sai?", {
              x: 15,
              y: 30,
              w: 70,
              h: 20,
            }),
            text(3, "A. ĐÚNG", { x: 18, y: 77, w: 17, h: 8 }),
            text(4, "B. SAI", { x: 68, y: 77, w: 12, h: 8 }),
          ],
        },
      ],
      media,
    ),
  );
  const page = analyzeDeck(deck).pages[0];
  if (page.kind !== "QUESTIONS") throw new Error("expected questions");
  expect(page.questions[0]).toMatchObject({
    options: [{ text: "ĐÚNG" }, { text: "SAI" }],
    correct: [],
    evidence: "NONE",
  });
});
