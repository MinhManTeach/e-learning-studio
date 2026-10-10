// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import { LessonPlayer } from "../src/player/LessonPlayer";
import type { LmsAdapter, LmsReport } from "../src/player/lms";
import { encodeResume } from "../src/player/resume";
import { createSession, visit } from "../src/player/session";

afterEach(cleanup);

function lesson() {
  const p = createProject("Bài 4. Làm việc với máy tính");
  p.metadata.subject = "Tin học";
  p.metadata.grade = "3";
  const titles = ["Khởi động", "Tư thế ngồi", "Chuột máy tính"];
  p.slides = titles.map((title) => {
    const s = createSlide("content");
    s.title = title;
    return s;
  });
  return p;
}
function fakeLms(saved = "") {
  const reports: LmsReport[] = [];
  let finished = 0;
  const lms: LmsAdapter = {
    kind: "SCORM_1_2",
    initialize: () => true,
    readSuspendData: () => saved,
    studentName: () => "",
    report: (r) => reports.push(r),
    finish: () => finished++,
  };
  return { lms, reports, finished: () => finished };
}

it("shows the lesson with subject and grade, and reports the first page to the LMS", () => {
  const p = lesson();
  const { lms, reports } = fakeLms();
  render(<LessonPlayer project={p} lms={lms} />);
  expect(screen.getByText("Tin học · Lớp 3")).toBeTruthy();
  expect(
    screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
  ).toContain("Khởi động");
  expect(reports.at(-1)).toMatchObject({
    status: "incomplete",
    location: "1",
  });
});

it("reports the new page after the student moves on", () => {
  const p = lesson();
  const { lms, reports } = fakeLms();
  render(<LessonPlayer project={p} lms={lms} />);
  fireEvent.click(screen.getByRole("button", { name: /Trang tiếp/ }));
  expect(reports.at(-1)?.location).toBe("2");
  expect(screen.getByText("Trang 2 / 3")).toBeTruthy();
});

it("continues where the student stopped and can start again from page 1", () => {
  const p = lesson();
  const saved = encodeResume(p, visit(createSession(p), p.slides[2].id));
  const { lms } = fakeLms(saved);
  render(<LessonPlayer project={p} lms={lms} />);
  expect(screen.getByRole("status").textContent).toContain(
    "Đang học tiếp từ trang 3",
  );
  expect(screen.getByText("Trang 3 / 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Học lại từ đầu" }));
  expect(screen.getByText("Trang 1 / 3")).toBeTruthy();
  expect(screen.queryByText(/Đang học tiếp/)).toBeNull();
});

it("jumps to a page from the table of contents and marks visited pages", () => {
  const p = lesson();
  render(<LessonPlayer project={p} lms={fakeLms().lms} />);
  fireEvent.click(screen.getByRole("button", { name: "Mục lục" }));
  const toc = screen.getByRole("navigation", { name: "Mục lục" });
  fireEvent.click(
    [...toc.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Chuột máy tính"),
    )!,
  );
  expect(screen.getByText("Trang 3 / 3")).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Mục lục" })).toBeNull();
});

it("enlarges text for students sitting far away", () => {
  const p = lesson();
  const { container } = render(
    <LessonPlayer project={p} lms={fakeLms().lms} />,
  );
  const article = () => container.querySelector("article")!;
  expect(article().style.getPropertyValue("--font-scale")).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "Tăng cỡ chữ" }));
  expect(article().style.getPropertyValue("--font-scale")).toBe("1.15");
  fireEvent.click(screen.getByRole("button", { name: "Giảm cỡ chữ" }));
  expect(article().style.getPropertyValue("--font-scale")).toBe("1");
});

it("lets the student switch colour theme without changing the lesson", () => {
  const p = lesson();
  const { container } = render(
    <LessonPlayer project={p} lms={fakeLms().lms} />,
  );
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "FOCUS_DARK" },
  });
  expect(container.querySelector(".canvas")?.getAttribute("data-theme")).toBe(
    "FOCUS_DARK",
  );
  expect(p.settings.theme).toBe("SAFE_TEAL");
});

it("closes the LMS attempt when the page is left", () => {
  const p = lesson();
  const lms = fakeLms();
  render(<LessonPlayer project={p} lms={lms.lms} />);
  window.dispatchEvent(new Event("pagehide"));
  expect(lms.finished()).toBe(1);
});

it("puts the page in a stage between the toolbar and the page buttons", () => {
  const p = lesson();
  const { container } = render(
    <LessonPlayer project={p} lms={fakeLms().lms} />,
  );
  const main = container.querySelector("main.lesson-player")!;
  const order = [...main.children].map((c) => c.className.split(" ")[0]);
  expect(order.indexOf("player-body")).toBeGreaterThan(
    order.indexOf("player-bar"),
  );
  expect(order.indexOf("player-nav")).toBe(order.indexOf("player-body") + 1);
  expect(
    main.querySelector(".player-body > .player-stage > .canvas"),
  ).toBeTruthy();
});

describe("on a wide screen", () => {
  let width: number;
  beforeEach(() => {
    width = window.innerWidth;
    window.innerWidth = 1280;
  });
  afterEach(() => {
    window.innerWidth = width;
  });
  it("shows the table of contents open on the left of the page", () => {
    const p = lesson();
    const { container } = render(
      <LessonPlayer project={p} lms={fakeLms().lms} />,
    );
    const body = container.querySelector(".player-body")!;
    expect(body.children[0].getAttribute("aria-label")).toBe("Mục lục");
    expect(body.children[1].className).toBe("player-stage");
    expect(
      screen
        .getByRole("button", { name: "Mục lục" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
  it("keeps the table of contents open after choosing a page", () => {
    const p = lesson();
    render(<LessonPlayer project={p} lms={fakeLms().lms} />);
    const toc = screen.getByRole("navigation", { name: "Mục lục" });
    fireEvent.click(
      [...toc.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Tư thế ngồi"),
      )!,
    );
    expect(screen.getByText("Trang 2 / 3")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Mục lục" })).toBeTruthy();
  });
});
