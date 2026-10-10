import { afterEach, expect, it } from "vitest";
import { createSlide } from "../src/model/factories";
import {
  pageSpeech,
  questionSpeech,
  joinSpeech,
} from "../src/player/readAloud";
import {
  pickVoice,
  setSpeechEngine,
  speak,
  speechChunks,
  stopSpeaking,
} from "../src/player/speech";

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
  let cancels = 0;
  setSpeechEngine({
    synth: {
      speak: (u: SpeechSynthesisUtterance) =>
        spoken.push(u as unknown as FakeUtterance),
      cancel: () => cancels++,
      getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    },
    Utterance: FakeUtterance as unknown as new (
      t: string,
    ) => SpeechSynthesisUtterance,
  });
  return { spoken, cancels: () => cancels };
}
afterEach(() => setSpeechEngine(null));

const an = { lang: "vi-VN", name: "Microsoft An - Vietnamese (Vietnam)" };
const hoaiMy = {
  lang: "vi-VN",
  name: "Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)",
};
const english = { lang: "en-US", name: "Microsoft Zira" };

it("prefers a natural Vietnamese voice and never falls back to another language", () => {
  expect(pickVoice([english, an, hoaiMy])).toBe(hoaiMy);
  expect(pickVoice([english, an])).toBe(an);
  expect(pickVoice([{ lang: "vi_VN", name: "Linh" }])?.name).toBe("Linh");
  expect(pickVoice([english])).toBeUndefined();
});

it("cuts long pages into short pieces at sentence ends", () => {
  const long = Array.from(
    { length: 12 },
    (_, i) => `Đây là câu số ${i + 1} của bài.`,
  ).join(" ");
  const chunks = speechChunks(long, 80);
  expect(chunks.length).toBeGreaterThan(3);
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(80);
  expect(chunks.join(" ")).toBe(long);
  expect(speechChunks("   ")).toEqual([]);
  // One sentence longer than a piece is cut between words.
  const words = "chuột ".repeat(60).trim();
  expect(speechChunks(words, 50).every((c) => c.length <= 50)).toBe(true);
});

it("reads with the Vietnamese voice, slowly, and marks the button as speaking", () => {
  const { spoken } = fakeEngine([english, an]);
  expect(speak("q1", "Chuột máy tính dùng để làm gì?")).toBe("OK");
  expect(spoken).toHaveLength(1);
  expect(spoken[0].voice).toBe(an);
  expect(spoken[0].lang).toBe("vi-VN");
  expect(spoken[0].rate).toBeLessThan(1);
});

it("stops when the same button is pressed again, and switches to a new one", () => {
  const { spoken, cancels } = fakeEngine([an]);
  speak("q1", "Câu một.");
  expect(speak("q1", "Câu một.")).toBe("STOPPED");
  expect(spoken).toHaveLength(1);
  speak("q1", "Câu một.");
  const before = cancels();
  expect(speak("q2", "Câu hai.")).toBe("OK");
  expect(cancels()).toBeGreaterThan(before);
  expect(spoken.at(-1)?.text).toBe("Câu hai.");
});

it("refuses to read Vietnamese with an English voice", () => {
  const { spoken } = fakeEngine([english]);
  expect(speak("q1", "Xin chào các em.")).toBe("NO_VOICE");
  expect(spoken).toHaveLength(0);
});

it("lets the browser choose while its voice list is still loading", () => {
  const { spoken } = fakeEngine([]);
  expect(speak("q1", "Xin chào các em.")).toBe("OK");
  expect(spoken[0].voice).toBeNull();
  expect(spoken[0].lang).toBe("vi-VN");
});

it("says so when the browser cannot speak at all", () => {
  setSpeechEngine({ synth: null, Utterance: null });
  expect(speak("q1", "Xin chào")).toBe("UNSUPPORTED");
});

it("ignores the end of a reading that was already stopped", () => {
  const { spoken } = fakeEngine([an]);
  speak("q1", "Một.");
  const first = spoken[0];
  speak("q2", "Hai.");
  first.onend?.(); // late event from the cancelled reading
  expect(speak("q2", "Hai.")).toBe("STOPPED"); // q2 was still the one speaking
  stopSpeaking();
});

it("reads the teacher's narration when the page has one", () => {
  const s = createSlide("content");
  s.voiceScript = "Các em cùng nghe cô kể nhé.";
  expect(pageSpeech(s)).toBe("Các em cùng nghe cô kể nhé.");
  s.narration = { ...s.narration, text: "Lời thuyết minh riêng." };
  expect(pageSpeech(s)).toBe("Lời thuyết minh riêng.");
});

it("otherwise reads what is written on the page, skipping placeholder titles", () => {
  const s = createSlide("content");
  s.title = "Trang 3";
  s.voiceScript = "";
  s.narration = { ...s.narration, text: "" };
  s.data = {
    ...s.data,
    body: "",
    paragraphs: [],
    bulletPoints: ["Ngồi thẳng lưng", "Mắt cách màn hình khoảng 50 cm"],
    keyTakeaway: "",
  };
  expect(pageSpeech(s)).toBe(
    "Ngồi thẳng lưng. Mắt cách màn hình khoảng 50 cm.",
  );
  s.title = "Tư thế ngồi đúng";
  expect(pageSpeech(s).startsWith("Tư thế ngồi đúng. Ngồi thẳng")).toBe(true);
});

it("reads cards and activities, saying 'Em cần nhớ' only once", () => {
  const cards = createSlide("cards");
  cards.title = "Các bước bật máy tính";
  cards.voiceScript = "";
  cards.narration = { ...cards.narration, text: "" };
  cards.data = {
    ...cards.data,
    style: "STEPS",
    intro: "",
    items: [
      { id: "a", title: "Bước 1", text: "Bật công tắc màn hình", group: 0 },
      { id: "b", title: "Bước 2", text: "Bấm nút nguồn thân máy", group: 0 },
    ],
    keyTakeaway: "Em cần nhớ: bật màn hình trước",
  };
  expect(pageSpeech(cards)).toBe(
    "Các bước bật máy tính. Bước 1. Bật công tắc màn hình. Bước 2. Bấm nút nguồn thân máy. Em cần nhớ: bật màn hình trước.",
  );
  const activity = createSlide("activity");
  activity.title = "Trò chơi";
  activity.voiceScript = "";
  activity.narration = { ...activity.narration, text: "" };
  activity.data = { ...activity.data, instruction: "Xếp các bước theo thứ tự" };
  expect(pageSpeech(activity)).toBe("Trò chơi. Xếp các bước theo thứ tự.");
});

it("reads a quiz question with all its choices", () => {
  const quiz = createSlide("quiz");
  const q = {
    ...quiz.data.questions[0],
    prompt: "Bộ phận nào dùng để gõ chữ?",
    options: [
      { id: "a", text: "Bàn phím" },
      { id: "b", text: "Loa" },
    ],
  };
  expect(questionSpeech(q, 1)).toBe(
    "Câu 2. Bộ phận nào dùng để gõ chữ? Bàn phím. Loa.",
  );
});

it("joins pieces with pauses and drops empty ones", () => {
  expect(joinSpeech(["Xin chào", "", null, "Các em!", "  "])).toBe(
    "Xin chào. Các em!",
  );
});
