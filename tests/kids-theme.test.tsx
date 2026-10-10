// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import { parseProject } from "../src/model/schema";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { LessonPlayer, themeLabels } from "../src/player/LessonPlayer";
import { celebrate, celebrationEvent } from "../src/player/celebrate";
import { Celebration } from "../src/player/Celebration";
import type { LmsAdapter } from "../src/player/lms";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const lms: LmsAdapter = {
  kind: "STANDALONE",
  initialize: () => true,
  readSuspendData: () => "",
  studentName: () => "",
  report: () => {},
  finish: () => {},
};

it("gives new lessons the children's look and keeps the theme older lessons saved", () => {
  expect(createProject().settings.theme).toBe("KIDS");
  const old = createProject();
  old.settings = { ...old.settings, theme: "NAVY" };
  expect(parseProject(JSON.parse(JSON.stringify(old))).settings.theme).toBe(
    "NAVY",
  );
  expect(themeLabels.KIDS).toBe("Vui nhộn");
});

it("colours each page by its learning stage", () => {
  const p = createProject();
  const s = createSlide("content");
  s.pedagogicalStage = "PRACTICE";
  p.slides = [s];
  const { container } = render(<SlideCanvas slide={s} project={p} />);
  const canvas = container.querySelector(".canvas")!;
  expect(canvas.getAttribute("data-theme")).toBe("KIDS");
  expect(canvas.getAttribute("data-stage")).toBe("PRACTICE");
});

it("cheers with confetti when the child is right and nudges gently otherwise", () => {
  vi.useFakeTimers();
  render(<Celebration sound={false} />);
  act(() => celebrate("right"));
  expect(screen.getByRole("status").textContent).toMatch(
    /Giỏi quá!|Tuyệt vời!|Chính xác!|Xuất sắc!/,
  );
  expect(document.querySelectorAll(".confetti").length).toBeGreaterThan(10);
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => celebrate("retry"));
  expect(screen.getByRole("status").textContent).toMatch(
    /Thử lại nhé!|Gần đúng rồi!|Cố lên nào!/,
  );
  expect(document.querySelectorAll(".confetti")).toHaveLength(0);
});

it("celebrates a finished activity and lets the child turn the sound off", () => {
  const heard: string[] = [];
  const listen = (e: Event) => heard.push((e as CustomEvent).detail);
  window.addEventListener(celebrationEvent, listen);
  const p = createProject();
  const a = createSlide("activity");
  a.data.kind = "ORDER";
  a.data.items = [
    { id: "x1", text: "Một", match: "", group: 0 },
    { id: "x2", text: "Hai", match: "", group: 0 },
  ];
  p.slides = [a];
  const { container } = render(<LessonPlayer project={p} lms={lms} />);
  expect(container.querySelector("main")?.getAttribute("data-theme")).toBe(
    "KIDS",
  );
  fireEvent.click(screen.getByRole("button", { name: "Một" }));
  fireEvent.click(screen.getByRole("button", { name: "Hai" }));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
  expect(heard).toEqual(["right"]);
  const bell = screen.getByRole("button", { name: "Âm thanh khen thưởng" });
  expect(bell.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(bell);
  expect(bell.getAttribute("aria-pressed")).toBe("false");
  window.removeEventListener(celebrationEvent, listen);
});
