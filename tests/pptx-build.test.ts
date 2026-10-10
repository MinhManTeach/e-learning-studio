import { expect, it } from "vitest";
import { parsePptx } from "../src/import/pptx/parse";
import { analyzeDeck } from "../src/import/pptx/analyze";
import {
  buildLessonFromPptx,
  slideNumberFromName,
} from "../src/import/pptx/build";
import {
  buildPptx,
  mp4Bytes,
  picture,
  pngBytes,
  text,
  wavBytes,
} from "./support/pptxFixture";

const emf = new Uint8Array([1, 0, 0, 0, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
function deck() {
  const bytes = buildPptx(
    [
      {
        shapes: [
          text(2, "KHỞI ĐỘNG", { x: 10, y: 5, w: 40, h: 10 }),
          text(3, "Kể tên các bộ phận của máy tính.", {
            x: 10,
            y: 20,
            w: 40,
            h: 10,
          }),
          picture(4, "rIdP", { x: 55, y: 20, w: 35, h: 60 }),
        ],
        rels: { rIdP: { type: "image", target: "../media/image1.png" } },
        notes: "GV cho HS quan sát tranh.",
      },
      {
        shapes: [
          text(2, "Quan sát video", { x: 7, y: 2, w: 47, h: 14 }),
          picture(
            3,
            "rIdP",
            { x: 14, y: 20, w: 72, h: 72 },
            { media: { rId: "rIdV", kind: "video" } },
          ),
        ],
        rels: {
          rIdP: { type: "image", target: "../media/image1.png" },
          rIdV: { type: "video", target: "../media/media1.mp4" },
        },
      },
      {
        shapes: [
          text(2, "Luyện tập - Câu 1: Tư thế nào đúng?", {
            x: 6,
            y: 5,
            w: 80,
            h: 10,
          }),
          picture(20, "rIdA", { x: 10, y: 40, w: 20, h: 30 }),
          picture(21, "rIdB", { x: 60, y: 40, w: 20, h: 30 }),
          text(10, "A", { x: 18, y: 74, w: 4, h: 8 }),
          text(11, "B", { x: 68, y: 74, w: 4, h: 8 }),
          picture(
            30,
            "rIdIcon",
            { x: 101, y: 5, w: 3, h: 5 },
            { name: "dung 2", media: { rId: "rIdOk", kind: "audio" } },
          ),
        ],
        rels: {
          rIdA: { type: "image", target: "../media/image1.png" },
          rIdB: { type: "image", target: "../media/image2.emf" },
          rIdIcon: { type: "image", target: "../media/image1.png" },
          rIdOk: { type: "audio", target: "../media/dung.wav" },
        },
        // Both answers play the "correct" sound: the teacher must decide.
        triggers: { "10": ["30"], "11": ["30"] },
      },
    ],
    {
      "image1.png": pngBytes,
      "image2.emf": emf,
      "media1.mp4": mp4Bytes,
      "dung.wav": wavBytes,
    },
  );
  return { bytes, analysis: analyzeDeck(parsePptx(bytes)) };
}

it("reads the slide number from PowerPoint's exported picture names", () => {
  expect(slideNumberFromName("Slide12.PNG")).toBe(12);
  expect(slideNumberFromName("Trang chiếu3.png")).toBe(3);
  expect(slideNumberFromName("bai4_tiet1_07.jpg")).toBe(7);
  expect(slideNumberFromName("anh.png")).toBeUndefined();
});

it("builds a lesson with the slide picture, the video, the picture quiz and a completion page", () => {
  const { bytes, analysis } = deck();
  const { project, media, warnings } = buildLessonFromPptx({
    title: "Bài 4. Làm việc với máy tính – Tiết 1",
    subject: "Tin học",
    grade: "3",
    pages: analysis.pages,
    pptx: bytes,
    slidePictures: [{ slide: 1, name: "Slide1.PNG", bytes: pngBytes }],
  });
  expect(project.metadata).toMatchObject({ subject: "Tin học", grade: "3" });
  expect(project.slides.map((s) => [s.type, s.layout])).toEqual([
    ["content", "MEDIA_COVER"],
    ["content", "MEDIA_COVER"],
    ["quiz", "TEXT_ONLY"],
    ["completion", "TEXT_ONLY"],
  ]);
  const [page, video, quiz] = project.slides;
  // Slide 1 uses the teacher's exported picture, keeps its text for read-aloud.
  expect(page.media.assetId).toBe("slide-1");
  expect(page.pedagogicalStage).toBe("OPENING");
  expect(page.type === "content" && page.data.bulletPoints).toEqual([
    "Kể tên các bộ phận của máy tính.",
  ]);
  expect(page.teacherNotes).toBe("GV cho HS quan sát tranh.");
  const videoAsset = project.assets.find((a) => a.id === video.media.assetId);
  expect(videoAsset).toMatchObject({ kind: "VIDEO", mimeType: "video/mp4" });
  if (quiz.type !== "quiz") throw new Error("expected quiz");
  const options = quiz.data.questions[0].options;
  expect(options.map((o) => o.text)).toEqual(["A", "B"]);
  expect(options[0].imageAssetId).toBe("pptx-image1-png");
  // The EMF picture is not supported in browsers: the answer keeps its letter only.
  expect(options[1].imageAssetId).toBeUndefined();
  expect(quiz.teacherNotes).toMatch(/Cần kiểm tra đáp án đúng/);
  expect(warnings).toEqual([
    "Slide 3: bỏ qua “image2.emf” vì định dạng chưa hỗ trợ.",
    "Slide 3, câu 1: PowerPoint có nhiều đáp án đúng; hãy kiểm tra lại trong trình soạn.",
  ]);
  expect(media.map((m) => [m.assetId, m.mimeType]).sort()).toEqual([
    ["pptx-image1-png", "image/png"],
    ["pptx-media1-mp4", "video/mp4"],
    ["slide-1", "image/png"],
  ]);
  expect(media.every((m) => m.projectId === project.projectId)).toBe(true);
});

it("uses the picture found on the slide when no slide picture is given", () => {
  const { bytes, analysis } = deck();
  const { project } = buildLessonFromPptx({
    title: "",
    subject: "",
    grade: "",
    pages: analysis.pages,
    pptx: bytes,
    slidePictures: [],
  });
  expect(project.metadata.projectTitle).toBe("Bài giảng từ PowerPoint");
  expect(project.slides[0].layout).toBe("TEXT_LEFT_MEDIA_RIGHT");
  expect(project.slides[0].media.assetId).toBe("pptx-image1-png");
});
