import { afterEach, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createProject, createSlide } from "../src/model/factories";
import type { LessonProject } from "../src/model/schema";
import type { StoredMedia } from "../src/media/model";
import {
  lessonSpeechPieces,
  pageSpeech,
  questionPieces,
  voiceKey,
} from "../src/player/readAloud";
import {
  setSpeechEngine,
  setVoiceClips,
  speak,
  speechSupported,
  stopSpeaking,
  type ClipPlayer,
} from "../src/player/speech";
import {
  recordMissing,
  voiceAssetId,
  voiceCoverage,
} from "../src/voice/voiceover";
import { buildLessonPackage } from "../src/export/package";
import { readPlayerData } from "../src/export/playerData";

afterEach(() => {
  stopSpeaking();
  setVoiceClips(null);
  setSpeechEngine(null);
});

function lesson(): LessonProject {
  const p = createProject("Bài 4");
  const content = createSlide("content");
  content.title = "Tư thế ngồi đúng";
  content.voiceScript = "";
  content.narration = { ...content.narration, text: "" };
  content.data = {
    ...content.data,
    body: "",
    paragraphs: [],
    bulletPoints: ["Ngồi thẳng lưng"],
    keyTakeaway: "",
  };
  const quiz = createSlide("quiz");
  quiz.narration = { ...quiz.narration, mode: "NONE" };
  const quiz2 = createSlide("quiz");
  quiz2.title = "Câu đố";
  quiz2.data = {
    ...quiz2.data,
    questions: [
      {
        ...quiz2.data.questions[0],
        prompt: "Bộ phận nào dùng để gõ chữ?",
        options: [
          { id: "a", text: "Bàn phím" },
          { id: "b", text: "Loa" },
        ],
        correctAnswerIndex: 0,
      },
    ],
  };
  p.slides = [content, quiz, quiz2];
  return p;
}

/** In-memory media store, like IndexedDB on the teacher's computer. */
function memoryStore() {
  const items = new Map<string, StoredMedia>();
  return {
    items,
    get: async (assetId: string, projectId: string) =>
      items.get(projectId + "/" + assetId),
    put: async (v: StoredMedia) => {
      items.set(v.projectId + "/" + v.assetId, v);
    },
  };
}
const m4a = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0,
]);
const m4aBase64 = Buffer.from(m4a).toString("base64");

it("lists every piece the lesson reads, once, skipping pages with reading off", () => {
  const p = lesson();
  const texts = lessonSpeechPieces(p).map((x) => x.text);
  expect(texts).toContain("Tư thế ngồi đúng. Ngồi thẳng lưng.");
  // The quiz is read in pieces so shuffled choices still match the screen.
  expect(texts).toContain("Câu 1.");
  expect(texts).toContain("Bộ phận nào dùng để gõ chữ?");
  expect(texts).toContain("Bàn phím.");
  expect(texts).toContain("Loa.");
  // Nothing from the page where the teacher switched reading off.
  const off = p.slides[1];
  expect(texts).not.toContain(pageSpeech(off));
  expect(new Set(texts).size).toBe(texts.length);
});

it("names a recording by its words and language, ignoring spacing", () => {
  expect(voiceKey("Xin  chào ")).toBe(voiceKey("Xin chào"));
  expect(voiceKey("Xin chào")).toMatch(/^[0-9a-f]{16}$/);
  expect(voiceKey("Xin chào")).not.toBe(voiceKey("Xin chào!"));
  expect(voiceKey("Xin chào", "vi-VN")).not.toBe(voiceKey("Xin chào", "en-US"));
});

class FakeAudio implements ClipPlayer {
  static played: string[] = [];
  static last: FakeAudio | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor(public src: string) {
    FakeAudio.last = this;
  }
  play() {
    FakeAudio.played.push(this.src);
  }
  pause() {
    this.paused = true;
  }
}
function engine(withSynth: boolean) {
  FakeAudio.played = [];
  const spoken: string[] = [];
  setSpeechEngine({
    synth: withSynth
      ? {
          speak: (u: SpeechSynthesisUtterance) => spoken.push(u.text),
          cancel: () => {},
          getVoices: () => [],
        }
      : null,
    Utterance: withSynth
      ? (class {
          constructor(public text: string) {}
        } as unknown as new (t: string) => SpeechSynthesisUtterance)
      : null,
    Audio: FakeAudio,
  });
  return spoken;
}

it("plays the recordings piece by piece when every piece was recorded", () => {
  const spoken = engine(true);
  const p = lesson();
  const q = p.slides[2];
  if (q.type !== "quiz") throw new Error("fixture");
  const pieces = questionPieces(q.data.questions[0], 0);
  setVoiceClips((key) => "voice/" + key + ".m4a");
  expect(speak("q", pieces)).toBe("OK");
  expect(FakeAudio.played).toEqual(["voice/" + voiceKey(pieces[0]) + ".m4a"]);
  FakeAudio.last?.onended?.();
  expect(FakeAudio.played).toHaveLength(2);
  expect(spoken).toEqual([]);
  // Pressing again stops the recording.
  expect(speak("q", pieces)).toBe("STOPPED");
  expect(FakeAudio.last?.paused).toBe(true);
});

it("falls back to the browser voice when a piece has no recording", () => {
  const spoken = engine(true);
  setVoiceClips((key) =>
    key === voiceKey("Câu 1.") ? "voice/0001.m4a" : undefined,
  );
  expect(speak("q", ["Câu 1.", "Chưa thu."])).toBe("OK");
  expect(FakeAudio.played).toEqual([]);
  expect(spoken.join(" ")).toBe("Câu 1. Chưa thu.");
});

it("shows listen buttons with recordings even where the browser has no voice", () => {
  engine(false);
  expect(speechSupported()).toBe(false);
  setVoiceClips(() => "voice/0001.m4a");
  expect(speechSupported()).toBe(true);
  expect(speak("x", "Xin chào")).toBe("OK");
  setVoiceClips(() => undefined);
  expect(speak("y", "Chưa thu")).toBe("NO_VOICE");
});

it("records only what is missing, in batches, and keeps the files on the device", async () => {
  const p = lesson();
  const store = memoryStore();
  const first = lessonSpeechPieces(p)[0];
  await store.put({
    assetId: voiceAssetId(first.key),
    projectId: p.projectId,
    blob: new Blob([m4a], { type: "audio/mp4" }),
    mimeType: "audio/mp4",
    size: m4a.length,
    source: {
      title: "",
      provider: "VOICE",
      sourceUrl: "",
      creator: "",
      license: "",
      licenseUrl: "",
      attribution: "",
    },
  });
  const before = await voiceCoverage(p, store);
  expect(before.recorded).toBe(1);
  const requests: { lang: string; texts: string[] }[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push(body);
    return new Response(
      JSON.stringify({ clips: body.texts.map(() => m4aBase64) }),
    );
  }) as unknown as typeof fetch;
  const progress: number[] = [];
  await recordMissing(p, before.missing, store, fetcher, (x) =>
    progress.push(x.done),
  );
  expect(requests[0].texts).toEqual(before.missing.map((x) => x.text));
  expect(requests[0].lang).toBe("vi-VN");
  expect(progress.at(-1)).toBe(before.missing.length);
  expect((await voiceCoverage(p, store)).missing).toEqual([]);
});

it("passes the server's error code on, and keeps what was already recorded", async () => {
  const p = lesson();
  const store = memoryStore();
  const { missing } = await voiceCoverage(p, store);
  const fetcher = (async () =>
    new Response(JSON.stringify({ error: "VOICE_MISSING" }), {
      status: 502,
    })) as unknown as typeof fetch;
  await expect(recordMissing(p, missing, store, fetcher)).rejects.toThrow(
    "VOICE_MISSING",
  );
  const offline = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  await expect(recordMissing(p, missing, store, offline)).rejects.toThrow(
    "VOICE_OFFLINE",
  );
});

it("packs the recordings into the SCORM package for any browser", async () => {
  const p = lesson();
  const store = memoryStore();
  const { missing } = await voiceCoverage(p, store);
  // Record all but one piece.
  const fetcher = (async (_u: string, init: RequestInit) =>
    new Response(
      JSON.stringify({
        clips: JSON.parse(String(init.body)).texts.map(() => m4aBase64),
      }),
    )) as unknown as typeof fetch;
  await recordMissing(p, missing.slice(1), store, fetcher);
  const pkg = await buildLessonPackage(p, store, { js: "", css: "" });
  expect(pkg.voiceCount).toBe(missing.length - 1);
  expect(pkg.voiceMissing).toBe(1);
  const files = unzipSync(pkg.bytes);
  expect(files["voice/0001.m4a"]).toEqual(m4a);
  expect(strFromU8(files["imsmanifest.xml"])).toContain(
    '<file href="voice/0001.m4a"/>',
  );
  const text = strFromU8(files["lesson-data.js"]);
  const data = readPlayerData(
    JSON.parse(text.replace(/^window\.__LESSON_PACKAGE__ = /, "").replace(/;\s*$/, "")),
  );
  expect(Object.values(data.voice ?? {})).toContain("voice/0001.m4a");
  expect(Object.keys(data.voice ?? {})).toContain(missing[1].key);
});

it("ignores voice entries in a package that are not ours", () => {
  const p = lesson();
  const data = readPlayerData({
    format: "E_LEARNING_STUDIO_PLAYER",
    version: 1,
    project: p,
    files: {},
    voice: {
      "0123456789abcdef": "voice/0001.m4a",
      "../evil": "voice/0002.m4a",
      "fedcba9876543210": "https://evil.example/x.m4a",
    },
  });
  expect(data.voice).toEqual({ "0123456789abcdef": "voice/0001.m4a" });
});
