// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseProject, type LessonProject } from "../src/model/schema";
import { AiStudio } from "../src/ai/AiStudio";
import { aiLesson, aiPlan } from "./support/aiLesson";

afterEach(cleanup);
type Quiz = Extract<LessonProject["slides"][number], { type: "quiz" }>;

it("shows the AI's suggested answer and applies it only when the teacher ticks it", async () => {
  const project = aiLesson();
  const quiz = project.slides.find((s) => s.type === "quiz") as Quiz;
  quiz.data.questions[0] = { ...quiz.data.questions[0], answerUnknown: true };
  const applied: LessonProject[] = [];
  const fetcher = (async (url: string) =>
    new Response(
      JSON.stringify(
        url.endsWith("/status")
          ? {
              provider: "anthropic",
              configured: true,
              model: "claude-haiku-5-5",
              imageModel: "",
              images: false,
            }
          : { ...aiPlan, answers: [{ questionId: "q1", correct: [1] }] },
      ),
    )) as unknown as typeof fetch;
  render(
    <AiStudio
      project={parseProject(project)}
      media={{ get: async () => undefined }}
      apply={(p) => applied.push(p)}
      onClose={() => {}}
      fetcher={fetcher}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  expect(
    await screen.findByText("Gợi ý đáp án cho 1 câu chưa có đáp án"),
  ).toBeTruthy();
  const tick = screen.getByRole("checkbox", {
    name: /Dùng đáp án gợi ý cho câu/,
  });
  expect((tick as HTMLInputElement).checked).toBe(false);
  fireEvent.click(tick);
  fireEvent.click(screen.getByRole("button", { name: /^Áp dụng/ }));
  const q1 = (applied[0].slides.find((s) => s.type === "quiz") as Quiz).data
    .questions[0];
  expect(q1.answerUnknown).toBeUndefined();
  expect(q1.correctAnswerIndex).toBe(1);
});
