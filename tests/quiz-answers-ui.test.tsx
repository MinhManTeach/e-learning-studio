// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import {
  parseProject,
  type LessonProject,
  type QuizData,
} from "../src/model/schema";
import { QuizEditor } from "../src/editor/QuizEditor";
import { LessonPlayer } from "../src/player/LessonPlayer";
import { StandaloneAdapter } from "../src/player/lms";

afterEach(cleanup);

type Quiz = Extract<LessonProject["slides"][number], { type: "quiz" }>;
function quizData(unknown = false): QuizData {
  const quiz = createSlide("quiz");
  return {
    ...quiz.data,
    questions: [
      {
        id: "q",
        level: "RECOGNITION",
        prompt: "Em cần những thông tin gì?",
        options: [
          { id: "a", text: "Vị trí điểm tham quan" },
          { id: "b", text: "Dự báo thời tiết" },
          { id: "c", text: "Màu yêu thích" },
        ],
        correctAnswerIndex: 0,
        ...(unknown ? { answerUnknown: true } : {}),
        explanation: "",
        points: 10,
      },
    ],
  };
}
function Editor({ start, seen }: { start: QuizData; seen: QuizData[] }) {
  const [data, setData] = useState(start);
  return (
    <QuizEditor
      data={data}
      onChange={(d) => {
        seen.push(d);
        setData(d);
      }}
    />
  );
}

it("lets the teacher tick several right answers for one question", () => {
  const seen: QuizData[] = [];
  render(<Editor start={quizData()} seen={seen} />);
  const second = screen.getByRole("checkbox", {
    name: "Lựa chọn 2: Dự báo thời tiết",
  });
  fireEvent.click(second);
  expect(seen.at(-1)?.questions[0].correctAnswerIndexes).toEqual([0, 1]);
  expect(screen.getByText(/phải chọn đủ tất cả đáp án đúng/)).toBeTruthy();
  // The last right answer cannot be unticked.
  fireEvent.click(second);
  fireEvent.click(screen.getByRole("checkbox", { name: /Lựa chọn 1/ }));
  expect(seen.at(-1)?.questions[0].correctAnswerIndex).toBe(0);
  expect(seen.at(-1)?.questions[0].correctAnswerIndexes).toBeUndefined();
});

it("flags a question PowerPoint gave no answer for until the teacher chooses", () => {
  const seen: QuizData[] = [];
  render(<Editor start={quizData(true)} seen={seen} />);
  expect(screen.getByText(/Chưa chọn đáp án/)).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toMatch(
    /PowerPoint không cho biết/,
  );
  // Nothing looks chosen yet.
  expect(
    screen
      .getAllByRole("checkbox")
      .every((c) => !(c as HTMLInputElement).checked),
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /Lựa chọn 2/ }));
  const q = seen.at(-1)!.questions[0];
  expect(q.answerUnknown).toBeUndefined();
  expect(q.correctAnswerIndex).toBe(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("shows tick boxes to the student and scores only a complete answer", () => {
  const p = createProject("Bài 3");
  const quiz = createSlide("quiz");
  quiz.data = { ...quizData(), shuffleAnswers: false };
  quiz.data.questions[0].correctAnswerIndexes = [0, 1];
  p.slides = [quiz];
  render(
    <LessonPlayer
      project={parseProject(p)}
      lms={new StandaloneAdapter("k", null)}
    />,
  );
  expect(
    screen.getByText(/nhiều đáp án đúng: em hãy chọn tất cả/),
  ).toBeTruthy();
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(3);
  fireEvent.click(boxes[0]);
  fireEvent.click(boxes[1]);
  expect((boxes[0] as HTMLInputElement).checked).toBe(true);
  expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
  expect(screen.getByText("✓ Đúng")).toBeTruthy();
  expect(
    screen.getByText(/Đáp án đúng: Vị trí điểm tham quan; Dự báo thời tiết/),
  ).toBeTruthy();
});
