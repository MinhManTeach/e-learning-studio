// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { strFromU8, unzipSync } from "fflate";
import { parsePptx } from "../src/import/pptx/parse";
import { analyzeDeck } from "../src/import/pptx/analyze";
import { buildLessonFromPptx } from "../src/import/pptx/build";
import { buildLessonPackage } from "../src/export/package";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { SessionContext } from "../src/player/SessionContext";
import {
  ImageResolverContext,
  packagedImageResolver,
} from "../src/media/imageResolver";
import { detectSoundMime } from "../src/media/storage";
import type { LessonProject } from "../src/model/schema";
import { strToU8 } from "fflate";
import {
  buildPptx,
  picture,
  pngBytes,
  text,
  wavBytes,
} from "./support/pptxFixture";

afterEach(cleanup);

const mp3Bytes = strToU8("ID3\u0004\0\0\0\0\0\0rest-of-mp3");
const wmaBytes = new Uint8Array([
  0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0, 0xaa, 0, 0x62,
  0xce, 0x6c,
]);

/** A music lesson: click the drum picture to hear it, a sound icon, background
 * music hidden off the slide, a transition sound and points that fly in. */
function musicDeck() {
  return buildPptx(
    [
      {
        shapes: [
          text(2, "Nhạc cụ gõ", { x: 5, y: 3, w: 60, h: 12 }, { title: true }),
          text(3, ["Trống có tiếng vang to.", "Thanh phách gõ nhịp đều."], {
            x: 5,
            y: 20,
            w: 45,
            h: 30,
          }),
          picture(4, "rIdP", { x: 55, y: 20, w: 30, h: 40 }, { name: "Trống" }),
          picture(
            5,
            "rIdI",
            { x: 55, y: 70, w: 5, h: 8 },
            { name: "Audio 1", media: { rId: "rIdA", kind: "audio" } },
          ),
          picture(
            6,
            "rIdI",
            { x: 120, y: 10, w: 5, h: 8 },
            { name: "Nhạc nền", media: { rId: "rIdB", kind: "audio" } },
          ),
        ],
        rels: {
          rIdP: { type: "image", target: "../media/image1.png" },
          rIdI: { type: "image", target: "../media/image1.png" },
          rIdA: { type: "audio", target: "../media/trong.mp3" },
          rIdB: { type: "audio", target: "../media/nen.wav" },
          rIdT: { type: "audio", target: "../media/media9.wav" },
        },
        triggers: { "4": ["5"] },
        appear: ["3"],
        transitionSound: "rIdT",
      },
      {
        shapes: [
          text(2, "Hát theo", { x: 5, y: 3, w: 60, h: 12 }, { title: true }),
          picture(
            3,
            "rIdI",
            { x: 10, y: 30, w: 5, h: 8 },
            { media: { rId: "rIdW", kind: "audio" } },
          ),
        ],
        rels: {
          rIdI: { type: "image", target: "../media/image1.png" },
          rIdW: { type: "audio", target: "../media/bai-hat.wma" },
        },
      },
    ],
    {
      "image1.png": pngBytes,
      "trong.mp3": mp3Bytes,
      "nen.wav": wavBytes,
      "media9.wav": wavBytes,
      "bai-hat.wma": wmaBytes,
    },
  );
}

it("recognises MP3, WAV and OGG sounds by their bytes", () => {
  expect(detectSoundMime(mp3Bytes)).toBe("audio/mpeg");
  expect(detectSoundMime(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBe(
    "audio/mpeg",
  );
  expect(detectSoundMime(wavBytes)).toBe("audio/wav");
  expect(detectSoundMime(strToU8("OggS\0\u0002"))).toBe("audio/ogg");
  expect(detectSoundMime(wmaBytes)).toBe("");
});

it("finds the sounds of a slide and its click-by-click text", () => {
  const deck = parsePptx(musicDeck());
  expect(deck.slides[0].appear).toEqual(["3"]);
  expect(deck.slides[0].sound).toBe("ppt/media/media9.wav");
  const [page] = analyzeDeck(deck).pages;
  if (page.kind !== "PAGE") throw new Error("expected a page");
  expect(page.reveal).toBe(true);
  expect(page.sounds?.map((s) => [s.audio, s.label, !!s.area])).toEqual([
    // Clicking the drum picture plays the drum: the spot is the picture.
    ["ppt/media/trong.mp3", "Trống", true],
    ["ppt/media/nen.wav", "Nhạc nền", false],
    ["ppt/media/media9.wav", "Âm thanh khi mở trang", false],
  ]);
  expect(page.sounds?.[0].area).toMatchObject({ x: 55, y: 20, w: 30, h: 40 });
});

function build(slidePicture: boolean) {
  const bytes = musicDeck();
  return buildLessonFromPptx({
    title: "Âm nhạc 3",
    subject: "Âm nhạc",
    grade: "3",
    pages: analyzeDeck(parsePptx(bytes)).pages,
    pptx: bytes,
    slidePictures: slidePicture
      ? [{ slide: 1, name: "Slide1.PNG", bytes: pngBytes }]
      : [],
  });
}

it("keeps the sounds as lesson audio and tells the teacher about WMA", () => {
  const { project, media, warnings } = build(false);
  const [page] = project.slides;
  if (page.type !== "content") throw new Error("expected content");
  expect(page.data.revealOnClick).toBe(true);
  expect(page.data.sounds.map((s) => s.label)).toEqual([
    "Trống",
    "Nhạc nền",
    "Âm thanh khi mở trang",
  ]);
  // Without a picture of the whole slide there is nothing to click on: buttons.
  expect(page.data.sounds.every((s) => !s.area)).toBe(true);
  const audio = project.assets.filter((a) => a.kind === "AUDIO");
  expect(audio.map((a) => a.mimeType).sort()).toEqual([
    "audio/mpeg",
    "audio/wav",
    "audio/wav",
  ]);
  expect(media.filter((m) => m.mimeType.startsWith("audio/")).length).toBe(3);
  expect(warnings).toEqual([
    "Slide 2: bỏ qua âm thanh “bai-hat.wma” vì định dạng chưa hỗ trợ. Hãy đổi tệp sang MP3 trong PowerPoint rồi nhập lại.",
  ]);
});

it("puts a click spot on the slide picture and says the fly-in text is lost", () => {
  const { project, warnings } = build(true);
  const [page] = project.slides;
  if (page.type !== "content") throw new Error("expected content");
  expect(page.data.revealOnClick).toBe(false);
  expect(page.data.sounds[0].area).toMatchObject({ x: 55, y: 20 });
  expect(warnings).toContain(
    "Slide 1: chữ hiện dần khi bấm không giữ được vì trang dùng ảnh chụp slide.",
  );
});

const files = (project: LessonProject) =>
  Object.fromEntries(project.assets.map((a) => [a.id, `media/${a.id}`]));
function show(project: LessonProject, student: boolean) {
  const canvas = (
    <ImageResolverContext.Provider
      value={packagedImageResolver(files(project), "https://lms.example/sco/")}
    >
      <SlideCanvas slide={project.slides[0]} project={project} />
    </ImageResolverContext.Provider>
  );
  return render(
    student ? (
      <SessionContext.Provider
        value={{
          project,
          session: {} as never,
          act: () => {},
          review: () => {},
          retry: () => {},
        }}
      >
        {canvas}
      </SessionContext.Provider>
    ) : (
      canvas
    ),
  );
}

it("shows a student the points one click at a time, with sound buttons", () => {
  const { project } = build(false);
  const { container } = show(project, true);
  expect(container.querySelectorAll("li")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /Hiện ý tiếp theo/ }));
  expect(container.querySelectorAll("li")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Hiện ý tiếp theo/ })).toBeNull();
  const drum = screen.getByRole("button", { name: "Nghe: Trống" });
  expect(drum.querySelector("audio")?.getAttribute("src")).toMatch(
    /^https:\/\/lms\.example\/sco\/media\/pptx-trong-mp3$/,
  );
});

it("shows the teacher every point in the editor", () => {
  const { project } = build(false);
  const { container } = show(project, false);
  expect(container.querySelectorAll("li")).toHaveLength(2);
});

it("places the sound spot over the slide picture", () => {
  const { project } = build(true);
  show(project, true);
  const spot = screen.getByRole("button", { name: "Nghe: Trống" });
  expect(spot.className).toBe("sound-spot");
  expect(spot.style.left).toBe("55%");
  // The other sounds have no place on the slide: buttons at the bottom.
  expect(screen.getByRole("button", { name: "Nghe: Nhạc nền" }).className).toBe(
    "sound-button primary",
  );
});

it("packs the page sounds into the lesson package", async () => {
  const { project, media } = build(false);
  const store = new Map(media.map((m) => [m.assetId, m]));
  const pkg = await buildLessonPackage(
    project,
    { get: async (id) => store.get(id) },
    { js: "", css: "" },
  );
  expect(pkg.soundCount).toBe(3);
  const zip = unzipSync(pkg.bytes);
  expect(
    Object.keys(zip)
      .filter((f) => f.startsWith("media/sound-"))
      .sort(),
  ).toEqual([
    "media/sound-0001.mp3",
    "media/sound-0002.wav",
    "media/sound-0003.wav",
  ]);
  expect(strFromU8(zip["lesson-data.js"])).toContain("media/sound-0001.mp3");
});
