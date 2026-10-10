import { expect, it } from "vitest";
import {
  applyPolish,
  illustrationPrompt,
  illustrationsWanted,
  pictureAssets,
  polishPlanSchema,
  polishRequest,
  polishRequestSchema,
} from "../src/ai/polish";
import { aiLesson, aiPlan } from "./support/aiLesson";

it("sends every page but the completion page, with its pictures and questions", () => {
  const project = aiLesson();
  expect(pictureAssets(project).map((p) => p.slideId)).toEqual([
    "s-cover",
    "s-posture",
  ]);
  const request = polishRequest(
    project,
    new Map([["s-posture", { mimeType: "image/png", data: "AAAA" }]]),
  );
  expect(polishRequestSchema.parse(request)).toEqual(request);
  expect(request.lesson).toEqual({
    title: "Bài 4 tiết 2",
    subject: "Tin học",
    grade: "3",
  });
  expect(request.slides.map((s) => [s.id, s.type, s.picture])).toEqual([
    ["s-cover", "content", "COVER"],
    ["s-posture", "content", "PICTURE"],
    ["s-steps", "content", "NONE"],
    ["s-quiz", "quiz", "NONE"],
  ]);
  expect(request.slides[1]).toMatchObject({
    stage: "Mở đầu",
    image: 0,
    notes: "Nhắc HS ngồi ngay ngắn.",
  });
  expect(request.images).toEqual([{ mimeType: "image/png", data: "AAAA" }]);
  expect(request.slides[3].questions?.[0]).toEqual({
    id: "q1",
    prompt: "Thao tác nào đúng khi tắt máy tính?",
    options: ["Rút phích cắm điện.", "Chọn Start > Power > Shut down."],
    correct: 1,
    explanation: "",
  });
});

it("clips over-long answers instead of rejecting them", () => {
  const plan = polishPlanSchema.parse({
    illustrationStyle: "x",
    slides: [
      {
        id: "a",
        title: "T".repeat(500),
        bulletPoints: ["", ...Array.from({ length: 12 }, (_, i) => `ý ${i}`)],
      },
    ],
  });
  expect(plan.slides[0].title).toHaveLength(120);
  expect(plan.slides[0].bulletPoints).toHaveLength(8);
  expect(plan.slides[0].explanations).toEqual([]);
});

it("applies wording, names, narration and alt text, never answers or order", () => {
  const project = aiLesson();
  const plan = polishPlanSchema.parse(aiPlan);
  const all = new Set(plan.slides.map((s) => s.id));
  const next = applyPolish(project, plan, all);
  expect(next.slides.map((s) => s.id)).toEqual(project.slides.map((s) => s.id));
  const [cover, posture, steps, quiz] = next.slides;
  expect(cover.title).toBe("Khám phá");
  expect(cover.voiceScript).toBe("Các em cùng khám phá nhé!");
  // A cover page shows the slide picture; its text is not replaced.
  expect(cover.type === "content" && cover.data.bulletPoints).toEqual([]);
  expect(posture.title).toBe("Hoạt động 1: Khởi động");
  expect(posture.type === "content" && posture.data).toMatchObject({
    bulletPoints: ["Ngồi lưng thẳng, vai thả lỏng."],
    keyTakeaway: "Ngồi đúng tư thế giúp em khoẻ mạnh.",
  });
  // Teacher-only lines move to the notes once.
  expect(posture.teacherNotes).toBe(
    "Nhắc HS ngồi ngay ngắn.\nKiểm tra tư thế: HS ngồi vào vị trí máy tính",
  );
  expect(next.assets.find((a) => a.id === "pic-boy")?.altText).toBe(
    "Bạn nhỏ ngồi đúng tư thế trước máy tính",
  );
  expect(steps.title).toBe("5 thao tác cơ bản với chuột");
  if (quiz.type !== "quiz") throw new Error("quiz expected");
  expect(quiz.data.questions.map((q) => q.correctAnswerIndex)).toEqual([1, 0]);
  expect(quiz.data.questions.map((q) => q.explanation)).toEqual([
    "Tắt bằng Start giúp máy lưu dữ liệu.",
    "Giáo viên đã giải thích.",
  ]);
  // The original is untouched.
  expect(project.slides[0].title).toBe("Trang 12");
  expect(project.assets[1].altText).toBe("");
});

it("leaves pages the teacher did not accept as they were", () => {
  const project = aiLesson();
  const plan = polishPlanSchema.parse(aiPlan);
  const next = applyPolish(project, plan, new Set(["s-cover"]));
  expect(next.slides.map((s) => s.title)).toEqual([
    "Khám phá",
    ...project.slides.slice(1).map((s) => s.title),
  ]);
});

it("offers new pictures only for pages that have none", () => {
  const project = aiLesson();
  const plan = polishPlanSchema.parse(aiPlan);
  expect(illustrationsWanted(project, plan)).toEqual([
    {
      slideId: "s-steps",
      title: "5 thao tác cơ bản với chuột",
      prompt: "A child's hand moving a computer mouse on a desk",
    },
  ]);
  const prompt = illustrationPrompt(plan.illustrationStyle, "A mouse");
  expect(prompt).toContain("A mouse");
  expect(prompt).toContain("Bright flat illustration for children.");
  expect(prompt).toMatch(/no text/i);
});

it("lets the teacher undo an AI change from the editor", async () => {
  const { editorReducer, editorState } = await import("../src/editor/reducer");
  const project = aiLesson();
  const plan = polishPlanSchema.parse(aiPlan);
  const changed = applyPolish(project, plan, new Set(["s-cover"]));
  let state = editorReducer(editorState(project), {
    type: "ai",
    project: changed,
  });
  expect(state.project.slides[0].title).toBe("Khám phá");
  expect(state.revision).toBe(1);
  state = editorReducer(state, { type: "quality-undo" });
  expect(state.project).toBe(project);
});
