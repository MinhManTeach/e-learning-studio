// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import type { LessonProject } from "../src/model/schema";
import { LessonPlayer } from "../src/player/LessonPlayer";
import type { LmsAdapter } from "../src/player/lms";
import {
  certificateCode,
  certificateStatus,
  formatDateVi,
} from "../src/player/certificate";
import { createSession, sessionReducer } from "../src/player/session";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function lesson(): LessonProject {
  const p = createProject("Bài 4. Làm việc với máy tính – Tiết 1");
  p.metadata.subject = "Tin học";
  p.metadata.grade = "3";
  p.metadata.schoolName = "TH Hòa Bình";
  p.slides = [createSlide("quiz"), createSlide("completion")];
  p.settings = { ...p.settings, requireAllSlides: false, passingScore: 80 };
  return p;
}
function answered(p: LessonProject, correct: boolean) {
  const quiz = p.slides[0];
  if (quiz.type !== "quiz") throw new Error("fixture");
  const q = quiz.data.questions[0];
  let s = createSession(p);
  s = sessionReducer(p, s, {
    type: "answer",
    id: quiz.id,
    questionId: q.id,
    optionId: q.options[correct ? q.correctAnswerIndex : 1].id,
  });
  return sessionReducer(p, s, { type: "submit", id: quiz.id });
}
const lms = (name = ""): LmsAdapter => ({
  kind: "SCORM_1_2",
  initialize: () => true,
  readSuspendData: () => "",
  studentName: () => name,
  report: () => {},
  finish: () => {},
});
function openCompletion(p: LessonProject, name = "") {
  render(<LessonPlayer project={p} lms={lms(name)} />);
  const quiz = p.slides[0];
  if (quiz.type !== "quiz") throw new Error("fixture");
  return quiz;
}

it("is earned by passing the quiz, not by failing it or skipping it", () => {
  const p = lesson();
  expect(certificateStatus(p, createSession(p))).toMatchObject({
    eligible: false,
    reason: "Hoàn thành bài học để nhận giấy chứng nhận.",
  });
  expect(certificateStatus(p, answered(p, false))).toMatchObject({
    eligible: false,
    reason: "Đạt từ 80% trở lên để nhận giấy chứng nhận.",
  });
  expect(certificateStatus(p, answered(p, true))).toMatchObject({
    eligible: true,
    score: 100,
    hasQuiz: true,
  });
});

it("gives a short check code that changes when the name or score changes", () => {
  const day = new Date(2026, 9, 10);
  const code = certificateCode("lesson-1", "Nguyễn Văn An", 100, day);
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  expect(certificateCode("lesson-1", " nguyễn văn an ", 100, day)).toBe(code);
  expect(certificateCode("lesson-1", "Nguyễn Văn Ân", 100, day)).not.toBe(code);
  expect(certificateCode("lesson-1", "Nguyễn Văn An", 90, day)).not.toBe(code);
  expect(formatDateVi(day)).toBe("10/10/2026");
});

it("keeps the certificate button off until the quiz is passed", () => {
  const p = lesson();
  openCompletion(p);
  fireEvent.click(screen.getByRole("button", { name: /Trang tiếp/ }));
  expect(
    (
      screen.getByRole("button", {
        name: "Nhận giấy chứng nhận",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByText("Hoàn thành bài học để nhận giấy chứng nhận."),
  ).toBeTruthy();
});

it("fills in the LMS name, score and date, and needs a name to print", () => {
  const p = lesson();
  const quiz = openCompletion(p, "Nguyễn Văn An");
  const q = quiz.data.questions[0];
  fireEvent.click(
    screen.getByRole("radio", { name: q.options[q.correctAnswerIndex].text }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
  fireEvent.click(screen.getByRole("button", { name: /Trang tiếp/ }));
  fireEvent.click(screen.getByRole("button", { name: "Nhận giấy chứng nhận" }));
  const dialog = screen.getByRole("dialog", {
    name: "Giấy chứng nhận hoàn thành",
  });
  expect(dialog.textContent).toContain("Nguyễn Văn An");
  expect(dialog.textContent).toContain("Bài 4. Làm việc với máy tính – Tiết 1");
  expect(dialog.textContent).toContain("Tin học · Lớp 3");
  expect(dialog.textContent).toContain("Điểm kiểm tra: 100/100");
  expect(dialog.textContent).toContain(formatDateVi(new Date()));
  expect(dialog.textContent).toContain("Trường: TH Hòa Bình");
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  const name = screen.getByRole("textbox", { name: "Họ và tên học sinh" });
  fireEvent.change(name, { target: { value: "   " } });
  const printButton = screen.getByRole("button", { name: /In \/ Lưu PDF/ });
  expect((printButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(name, { target: { value: "Trần Thị Bình" } });
  fireEvent.click(printButton);
  expect(print).toHaveBeenCalledOnce();
  expect(document.body.classList.contains("printing-certificate")).toBe(true);
  window.dispatchEvent(new Event("afterprint"));
  expect(document.body.classList.contains("printing-certificate")).toBe(false);
});

it("explains when the browser cannot make a picture of the certificate", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => null,
  );
  const p = lesson();
  const quiz = openCompletion(p, "Nguyễn Văn An");
  const q = quiz.data.questions[0];
  fireEvent.click(
    screen.getByRole("radio", { name: q.options[q.correctAnswerIndex].text }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
  fireEvent.click(screen.getByRole("button", { name: /Trang tiếp/ }));
  fireEvent.click(screen.getByRole("button", { name: "Nhận giấy chứng nhận" }));
  fireEvent.click(screen.getByRole("button", { name: /Tải ảnh PNG/ }));
  expect(screen.getByText(/chưa tải được ảnh/)).toBeTruthy();
});

it("closes with Escape", () => {
  const p = lesson();
  const quiz = openCompletion(p, "An");
  const q = quiz.data.questions[0];
  fireEvent.click(
    screen.getByRole("radio", { name: q.options[q.correctAnswerIndex].text }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));
  fireEvent.click(screen.getByRole("button", { name: /Trang tiếp/ }));
  fireEvent.click(screen.getByRole("button", { name: "Nhận giấy chứng nhận" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
