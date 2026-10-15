// @vitest-environment jsdom
// "Lời giảng": pieces follow the slide's clicks, the student's page speaks
// each piece and shows the next click by itself, and the package ships the
// recordings.
import { afterEach, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import type { BasicSlide, LessonProject, SlideItem } from "../src/model/schema";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { SessionContext } from "../src/player/SessionContext";
import { setSpeechEngine } from "../src/player/speech";
import { lectureFor, lectureSlots, slotSummary } from "../src/lecture/model";
import { lectureRequest } from "../src/lecture/client";
import { lectureRequestSchema } from "../src/lecture/ai";
import { detectSoundMime } from "../src/media/storage";

const item = (id: string, text: string, step?: number): SlideItem => ({
  id,
  kind: "TEXT",
  x: 5,
  y: 5,
  w: 40,
  h: 10,
  text: [text],
  ...(step ? { step } : {}),
});
/** Page 14 of "Trước cổng trời": a title, then two stanzas on clicks 1 and 2. */
function lesson(lecture: string[] = []): LessonProject {
  const slide = createSlide("content") as BasicSlide;
  slide.title = "Trước cổng trời";
  slide.data.original = {
    ratio: 16 / 9,
    items: [
      { ...item("bg", ""), kind: "IMAGE", text: [], locked: true },
      item("t", "Trước cổng trời"),
      item("k1", "Người Tày từ khắp ngả", 1),
      { ...item("img", ""), kind: "IMAGE", text: [], step: 2 },
      item("k2", "Vạt áo chàm thấp thoáng", 2),
    ],
  };
  slide.data.lecture = lecture.map((text) => ({ text }));
  return {
    ...createProject("Trước cổng trời"),
    metadata: {
      ...createProject().metadata,
      subject: "Tiếng Việt",
      grade: "5",
    },
    slides: [slide],
  };
}

it("cuts the lecture where the slide's clicks are", () => {
  const slide = lesson().slides[0] as BasicSlide;
  const slots = lectureSlots(slide);
  expect(slots.map((s) => [s.label, s.texts, s.pictures])).toEqual([
    ["Khi mở trang", ["Trước cổng trời"], 0],
    ["Lần bấm 1", ["Người Tày từ khắp ngả"], 0],
    ["Lần bấm 2", ["Vạt áo chàm thấp thoáng"], 1],
  ]);
  expect(slotSummary(slots[2])).toBe("Vạt áo chàm thấp thoáng + 1 hình");
  expect(lectureFor(slide)).toEqual([{ text: "" }, { text: "" }, { text: "" }]);
  // What the AI is told is a valid request.
  const request = lectureRequest(lesson(), slide);
  expect(lectureRequestSchema.parse(request)).toMatchObject({
    subject: "Tiếng Việt",
    grade: "5",
    pageTitle: "Trước cổng trời",
  });
});

class FakeUtterance {
  lang = "";
  voice: unknown = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
afterEach(() => {
  cleanup();
  setSpeechEngine(null);
});

it("speaks each piece, then shows the next click by itself", async () => {
  const spoken: FakeUtterance[] = [];
  setSpeechEngine({
    synth: {
      speak: (u: SpeechSynthesisUtterance) =>
        spoken.push(u as unknown as FakeUtterance),
      cancel: () => {},
      getVoices: () =>
        [{ lang: "vi-VN", name: "Microsoft An" }] as SpeechSynthesisVoice[],
    },
    Utterance: FakeUtterance as unknown as new (
      t: string,
    ) => SpeechSynthesisUtterance,
    Audio: null,
  });
  const project = lesson([
    "Hôm nay các em đọc bài thơ Trước cổng trời.",
    "Người Tày từ khắp ngả đi gặt lúa, trồng rau.",
    "Các em quan sát vạt áo chàm.",
  ]);
  render(
    <SessionContext.Provider
      value={{
        project,
        session: {} as never,
        act: () => {},
        review: () => {},
        retry: () => {},
      }}
    >
      <SlideCanvas slide={project.slides[0]} project={project} />
    </SessionContext.Provider>,
  );
  const visible = (text: string) =>
    screen.getByText(text).closest<HTMLElement>(".original-item")!.style
      .visibility !== "hidden";
  expect(visible("Người Tày từ khắp ngả")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /Nghe giảng/ }));
  expect(spoken.map((u) => u.text)).toEqual([
    "Hôm nay các em đọc bài thơ Trước cổng trời.",
  ]);
  // The opening piece ends: click 1 comes and its piece is read.
  await act(async () => spoken.at(-1)!.onend?.());
  expect(visible("Người Tày từ khắp ngả")).toBe(true);
  expect(visible("Vạt áo chàm thấp thoáng")).toBe(false);
  expect(spoken.at(-1)!.text).toBe(
    "Người Tày từ khắp ngả đi gặt lúa, trồng rau.",
  );
  await act(async () => spoken.at(-1)!.onend?.());
  expect(visible("Vạt áo chàm thấp thoáng")).toBe(true);
  expect(spoken.at(-1)!.text).toBe("Các em quan sát vạt áo chàm.");
  await act(async () => spoken.at(-1)!.onend?.());
  // All shown: the student can listen again.
  expect(screen.getByRole("button", { name: /Nghe lại/ })).toBeTruthy();
});

it("accepts a microphone recording (WebM) as a lesson sound", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  expect(detectSoundMime(webm)).toBe("audio/webm");
});

it("ships the lecture's recordings in the package", async () => {
  const { buildLessonPackage } = await import("../src/export/package");
  const { unzipSync } = await import("fflate");
  const project = lesson(["Chào các em.", "", ""]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
  project.assets.push({
    id: "lecture-1",
    kind: "AUDIO",
    sourceType: "UPLOAD",
    name: "Giọng thầy cô",
    fileName: "",
    mimeType: "audio/webm",
    size: webm.length,
    url: "local-media:lecture-1",
    altText: "",
    status: "LOCAL",
  });
  const slide = project.slides[0] as BasicSlide;
  slide.data.lecture[0] = {
    text: "Chào các em.",
    assetId: "lecture-1",
    voice: "TEACHER",
  };
  // The background picture is not stored: drop it from this small lesson.
  slide.data.original!.items = slide.data.original!.items.filter(
    (i) => i.kind !== "IMAGE",
  );
  const media = {
    get: async (id: string) =>
      id === "lecture-1"
        ? {
            assetId: id,
            projectId: project.projectId,
            blob: new Blob([webm], { type: "audio/webm" }),
            mimeType: "audio/webm",
            size: webm.length,
            source: {} as never,
          }
        : undefined,
  };
  const pkg = await buildLessonPackage(project, media, {
    js: "/* player */",
    css: "/* css */",
  });
  const files = unzipSync(pkg.bytes);
  expect(files["media/sound-0001.weba"]).toEqual(webm);
});
