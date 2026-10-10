// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import { LessonPlayer } from "../src/player/LessonPlayer";
import { StandaloneAdapter } from "../src/player/lms";
import { setSpeechEngine } from "../src/player/speech";

type Voice = { lang: string; name: string };
class FakeUtterance {
  lang = "";
  voice: Voice | null = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
function fakeEngine(voices: Voice[]) {
  const spoken: FakeUtterance[] = [];
  setSpeechEngine({
    synth: {
      speak: (u: SpeechSynthesisUtterance) =>
        spoken.push(u as unknown as FakeUtterance),
      cancel: () => {},
      getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    },
    Utterance: FakeUtterance as unknown as new (
      t: string,
    ) => SpeechSynthesisUtterance,
  });
  return spoken;
}
afterEach(() => {
  cleanup();
  setSpeechEngine(null);
});
const vietnamese = { lang: "vi-VN", name: "Microsoft An" };

function quizLesson(mode: "BROWSER_TTS" | "NONE" = "BROWSER_TTS") {
  const p = createProject("Bài 4");
  const quiz = createSlide("quiz");
  quiz.title = "Câu đố";
  quiz.narration = { ...quiz.narration, mode };
  quiz.data = {
    ...quiz.data,
    shuffleAnswers: false,
    questions: [
      {
        ...quiz.data.questions[0],
        prompt: "Bộ phận nào dùng để gõ chữ?",
        options: [
          { id: "a", text: "Bàn phím" },
          { id: "b", text: "Loa" },
        ],
        correctAnswerIndex: 0,
      },
    ],
  };
  p.slides = [quiz];
  return p;
}
const player = (p: ReturnType<typeof quizLesson>) =>
  render(<LessonPlayer project={p} lms={new StandaloneAdapter("k", null)} />);

it("reads a quiz question and its choices aloud for children who cannot read yet", () => {
  const spoken = fakeEngine([vietnamese]);
  player(quizLesson());
  fireEvent.click(screen.getByRole("button", { name: "Nghe đọc câu 1" }));
  expect(spoken.map((u) => u.text).join(" ")).toBe(
    "Câu 1. Bộ phận nào dùng để gõ chữ? Bàn phím. Loa.",
  );
  const stop = screen.getByRole("button", { name: "Dừng đọc câu 1" });
  expect(stop.getAttribute("aria-pressed")).toBe("true");
  act(() => spoken.at(-1)?.onend?.());
  expect(screen.getByRole("button", { name: "Nghe đọc câu 1" })).toBeTruthy();
});

it("explains what to do when the computer has no Vietnamese voice", () => {
  const spoken = fakeEngine([{ lang: "en-US", name: "Zira" }]);
  player(quizLesson());
  fireEvent.click(screen.getByRole("button", { name: "Nghe đọc câu 1" }));
  expect(spoken).toHaveLength(0);
  expect(
    screen
      .getAllByRole("status")
      .some((x) => /chưa có giọng đọc tiếng Việt/.test(x.textContent ?? "")),
  ).toBe(true);
});

it("has no listen buttons on a page where the teacher turned reading off", () => {
  fakeEngine([vietnamese]);
  player(quizLesson("NONE"));
  expect(screen.queryByRole("button", { name: /Nghe đọc/ })).toBeNull();
});

it("has no listen buttons where the browser cannot speak", () => {
  setSpeechEngine({ synth: null, Utterance: null });
  player(quizLesson());
  expect(screen.queryByRole("button", { name: /Nghe đọc/ })).toBeNull();
});

it("'Đọc bài' reads the words on an imported page that has no narration", () => {
  const spoken = fakeEngine([vietnamese]);
  const p = createProject("Bài 4");
  const s = createSlide("content");
  s.title = "Tư thế ngồi đúng";
  s.voiceScript = "";
  s.narration = { ...s.narration, text: "" };
  s.data = { ...s.data, body: "", paragraphs: [], keyTakeaway: "" };
  s.data.bulletPoints = ["Ngồi thẳng lưng"];
  p.slides = [s];
  render(<LessonPlayer project={p} lms={new StandaloneAdapter("k", null)} />);
  fireEvent.click(screen.getByRole("button", { name: /Đọc bài/ }));
  expect(spoken.map((u) => u.text).join(" ")).toBe(
    "Tư thế ngồi đúng. Ngồi thẳng lưng.",
  );
  expect(screen.getByRole("button", { name: /Dừng đọc/ })).toBeTruthy();
});
