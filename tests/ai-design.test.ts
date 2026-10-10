import { expect, it } from "vitest";
import {
  applyDesign,
  designPlanSchema,
  designWireSchema,
  redesigns,
  usableActivities,
} from "../src/ai/design";
import {
  lessonRequest,
  lessonRequestSchema,
  pictureAssets,
} from "../src/ai/request";
import { aiLesson, aiPlan } from "./support/aiLesson";

it("sends every page but the completion page, with its pictures and questions", () => {
  const project = aiLesson();
  expect(pictureAssets(project).map((p) => p.slideId)).toEqual([
    "s-cover",
    "s-posture",
  ]);
  const request = lessonRequest(
    project,
    new Map([["s-posture", { mimeType: "image/png", data: "AAAA" }]]),
  );
  expect(lessonRequestSchema.parse(request)).toEqual(request);
  expect(request.slides.map((s) => [s.id, s.type, s.picture])).toEqual([
    ["s-cover", "content", "COVER"],
    ["s-posture", "content", "PICTURE"],
    ["s-steps", "content", "NONE"],
    ["s-quiz", "quiz", "NONE"],
  ]);
  expect(request.slides[1]).toMatchObject({ stage: "Mở đầu", image: 0 });
  expect(request.slides[3].questions?.[0].correct).toBe(1);
});

it("reads loose answers: unknown designs are kept, lowercase designs accepted, lists clipped", () => {
  const plan = designPlanSchema.parse({
    pages: [
      { id: "a", design: "spiral", items: [] },
      {
        id: "b",
        design: "steps",
        items: Array.from({ length: 12 }, () => ({ title: "x" })),
      },
    ],
  });
  expect(plan.pages.map((p) => p.design)).toEqual(["KEEP", "STEPS"]);
  expect(plan.pages[1].items).toHaveLength(8);
  expect(plan.activities).toEqual([]);
  // The wire schema names every field the model must return.
  const wire = designWireSchema() as { required: string[] };
  expect(wire.required).toEqual(["pages", "activities", "explanations"]);
});

it("proposes only real redesigns and activities that can be built", () => {
  const project = aiLesson();
  const plan = designPlanSchema.parse(aiPlan);
  // KEEP pages and non-content pages (the quiz) are not redesigned.
  expect(redesigns(project, plan).map((p) => [p.id, p.design])).toEqual([
    ["s-posture", "COMPARE"],
    ["s-steps", "STEPS"],
  ]);
  // Not placed after a real page, or a sort with one group: dropped.
  expect(usableActivities(project, plan).map((a) => a.type)).toEqual([
    "ORDER",
    "TRUE_FALSE",
    "SCENARIO",
  ]);
});

it("applies chosen designs and activities after their pages, keeping every old page and answer", () => {
  const project = aiLesson();
  const plan = designPlanSchema.parse(aiPlan);
  const next = applyDesign(project, plan, {
    pages: new Set(["s-posture", "s-steps"]),
    activities: new Set([0, 1, 2]),
  });
  expect(next.slides.map((s) => s.type)).toEqual([
    "content",
    "cards",
    "quiz",
    "scenario",
    "cards",
    "activity",
    "quiz",
    "completion",
  ]);
  const posture = next.slides[1];
  if (posture.type !== "cards") throw new Error("cards expected");
  expect(posture.id).toBe("s-posture");
  expect(posture.title).toBe("Ngồi đúng tư thế");
  expect(posture.data).toMatchObject({
    style: "COMPARE",
    groups: ["Nên", "Không nên"],
    keyTakeaway: "Ngồi thẳng lưng khi dùng máy tính.",
  });
  expect(posture.data.items.map((i) => [i.title, i.group])).toEqual([
    ["Lưng thẳng", 0],
    ["Cúi sát màn hình", 1],
  ]);
  // The drawing beside the text stays; teacher-only lines go to the notes.
  expect(posture.media.enabled).toBe(true);
  expect(posture.layout).toBe("TEXT_LEFT_MEDIA_RIGHT");
  expect(posture.teacherNotes).toContain("Kiểm tra tư thế");
  const tf = next.slides[2];
  if (tf.type !== "quiz") throw new Error("quiz expected");
  expect(tf.data.questions[0].options.map((o) => o.text)).toEqual([
    "Đúng",
    "Sai",
  ]);
  expect(tf.data.questions[0].correctAnswerIndex).toBe(0);
  const scenario = next.slides[3];
  expect(
    scenario.type === "scenario" &&
      scenario.data.choices.map((c) => c.isRecommended),
  ).toEqual([true, false]);
  const order = next.slides[5];
  expect(
    order.type === "activity" && order.data.items.map((i) => i.text),
  ).toEqual(["Nháy Start", "Chọn Power", "Chọn Shut down"]);
  // The old quiz keeps its answers; only its missing explanation is filled.
  const quiz = next.slides[6];
  if (quiz.type !== "quiz") throw new Error("quiz expected");
  expect(quiz.data.questions.map((q) => q.correctAnswerIndex)).toEqual([1, 0]);
  expect(quiz.data.questions.map((q) => q.explanation)).toEqual([
    "Tắt bằng Start giúp máy lưu dữ liệu.",
    "Giáo viên đã giải thích.",
  ]);
  expect(project.slides).toHaveLength(5);
});

it("turns a whole-slide picture page into cards without repeating the picture", () => {
  const project = aiLesson();
  const plan = designPlanSchema.parse({
    pages: [
      {
        id: "s-cover",
        design: "FLIP",
        items: [
          { title: "Chuột", text: "Thiết bị trỏ" },
          { title: "Bàn phím", text: "Thiết bị gõ" },
        ],
      },
    ],
  });
  const next = applyDesign(project, plan, {
    pages: new Set(["s-cover"]),
    activities: new Set(),
  });
  const cover = next.slides[0];
  expect(cover.type).toBe("cards");
  expect(cover.media.enabled).toBe(false);
  expect(cover.layout).toBe("TEXT_ONLY");
});

it("leaves the lesson as it was when nothing is chosen", () => {
  const project = aiLesson();
  const plan = designPlanSchema.parse({ ...aiPlan, explanations: [] });
  const next = applyDesign(project, plan, {
    pages: new Set(),
    activities: new Set(),
  });
  expect(next.slides).toEqual(project.slides);
});

it("lets the teacher undo an AI change from the editor", async () => {
  const { editorReducer, editorState } = await import("../src/editor/reducer");
  const project = aiLesson();
  const plan = designPlanSchema.parse(aiPlan);
  const changed = applyDesign(project, plan, {
    pages: new Set(["s-steps"]),
    activities: new Set(),
  });
  let state = editorReducer(editorState(project), {
    type: "ai",
    project: changed,
  });
  expect(state.project.slides[2].type).toBe("cards");
  state = editorReducer(state, { type: "quality-undo" });
  expect(state.project).toBe(project);
});

it("puts the Nên column first when the AI listed Không nên first", () => {
  const project = aiLesson();
  const plan = designPlanSchema.parse({
    pages: [
      {
        id: "s-steps",
        design: "COMPARE",
        groups: ["Không nên", "Nên"],
        items: [
          { title: "Rút điện đột ngột", group: 0 },
          { title: "Chọn Shut down", group: 1 },
        ],
      },
    ],
    activities: [
      {
        afterId: "s-steps",
        type: "SORT",
        title: "Nên hay không?",
        groups: ["Không nên", "Nên"],
        items: [
          { text: "Rút điện", group: 0 },
          { text: "Shut down", group: 1 },
        ],
      },
    ],
  });
  const next = applyDesign(project, plan, {
    pages: new Set(["s-steps"]),
    activities: new Set([0]),
  });
  const page = next.slides[2];
  if (page.type !== "cards") throw new Error("cards expected");
  expect(page.data.groups).toEqual(["Nên", "Không nên"]);
  expect(page.data.items.map((i) => [i.title, i.group])).toEqual([
    ["Rút điện đột ngột", 1],
    ["Chọn Shut down", 0],
  ]);
  const sort = next.slides[3];
  if (sort.type !== "activity") throw new Error("activity expected");
  expect(sort.data.groups).toEqual(["Nên", "Không nên"]);
  expect(sort.data.items.map((i) => [i.text, i.group])).toEqual([
    ["Rút điện", 1],
    ["Shut down", 0],
  ]);
});
