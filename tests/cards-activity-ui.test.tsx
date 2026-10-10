// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { TypeSpecificEditor } from "../src/editor/TypeSpecificEditor";
import type { Slide } from "../src/model/schema";

afterEach(cleanup);

function show(slide: Slide) {
  const project = createProject();
  project.slides = [slide];
  render(<SlideCanvas slide={slide} project={project} />);
}
const cards = (
  style: "STEPS" | "COMPARE" | "FLIP" | "MINDMAP" | "TIMELINE",
) => {
  const s = createSlide("cards");
  s.title = "5 thao tác với chuột";
  s.data.style = style;
  s.data.items = [
    { id: "a", title: "Di chuyển", text: "Thay đổi vị trí", group: 0 },
    { id: "b", title: "Nháy chuột", text: "Nhấn nút trái 1 lần", group: 1 },
  ];
  return s;
};

it("shows numbered steps, two columns and a mind map", () => {
  show(cards("STEPS"));
  const steps = screen.getAllByRole("listitem");
  expect(steps.map((li) => li.textContent)).toEqual([
    "1Di chuyểnThay đổi vị trí",
    "2Nháy chuộtNhấn nút trái 1 lần",
  ]);
  cleanup();
  show(cards("COMPARE"));
  expect(screen.getByRole("heading", { name: "✓ Nên" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "✗ Không nên" })).toBeTruthy();
  cleanup();
  show(cards("MINDMAP"));
  expect(
    screen.getByText("5 thao tác với chuột", { selector: ".mindmap-center" }),
  ).toBeTruthy();
});

it("turns a flip card over when the child taps it", () => {
  show(cards("FLIP"));
  const card = screen.getByRole("button", { name: "Di chuyển (bấm để lật)" });
  fireEvent.click(card);
  expect(card.getAttribute("aria-pressed")).toBe("true");
  expect(card.getAttribute("aria-label")).toBe("Di chuyển: Thay đổi vị trí");
});

function activity(kind: "ORDER" | "SORT" | "MATCH") {
  const s = createSlide("activity");
  s.data.kind = kind;
  s.data.instruction = "Thử nào";
  s.data.items =
    kind === "MATCH"
      ? [
          { id: "l", text: "Nút trái", match: "Chọn", group: 0 },
          { id: "r", text: "Nút phải", match: "Mở bảng chọn", group: 0 },
        ]
      : [
          { id: "s1", text: "Nháy Start", match: "", group: 0 },
          { id: "s2", text: "Chọn Power", match: "", group: 1 },
          { id: "s3", text: "Chọn Shut down", match: "", group: 1 },
        ];
  return s;
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });

it("lets the child put steps in order, shows mistakes and lets them retry", () => {
  show(activity("ORDER"));
  expect(button("Kiểm tra").hasAttribute("disabled")).toBe(true);
  // Wrong order first.
  fireEvent.click(button("Chọn Shut down"));
  fireEvent.click(button("Nháy Start"));
  fireEvent.click(button("Chọn Power"));
  fireEvent.click(button("Kiểm tra"));
  expect(screen.getByRole("status").textContent).toMatch(/Chưa đúng hết/);
  fireEvent.click(button("Làm lại"));
  // Every slot was wrong, so all three cards are back.
  fireEvent.click(button("Nháy Start"));
  fireEvent.click(button("Chọn Power"));
  fireEvent.click(button("Chọn Shut down"));
  fireEvent.click(button("Kiểm tra"));
  expect(screen.getByRole("status").textContent).toMatch(/Chính xác/);
});

it("lets the child sort cards into two groups", () => {
  show(activity("SORT"));
  for (const [card, group] of [
    ["Nháy Start", "Nên"],
    ["Chọn Power", "Không nên"],
    ["Chọn Shut down", "Không nên"],
  ]) {
    fireEvent.click(button(card));
    fireEvent.click(button(`Đặt vào “${group}”`));
  }
  fireEvent.click(button("Kiểm tra"));
  expect(screen.getByRole("status").textContent).toMatch(/Chính xác/);
});

it("lets the child match pairs", () => {
  show(activity("MATCH"));
  fireEvent.click(button(/Nút trái/));
  fireEvent.click(button("Mở bảng chọn"));
  fireEvent.click(button(/Nút phải/));
  fireEvent.click(button("Chọn"));
  fireEvent.click(button("Kiểm tra"));
  expect(screen.getByRole("status").textContent).toMatch(/Chưa đúng hết/);
});

it("edits the style of a card page and the kind of an activity", () => {
  let slide: Slide = cards("STEPS");
  render(<TypeSpecificEditor slide={slide} edit={(s) => (slide = s)} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Kiểu trình bày" }), {
    target: { value: "COMPARE" },
  });
  expect(slide.type === "cards" && slide.data.style).toBe("COMPARE");
  cleanup();
  let act: Slide = activity("ORDER");
  render(<TypeSpecificEditor slide={act} edit={(s) => (act = s)} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Kiểu hoạt động" }), {
    target: { value: "MATCH" },
  });
  expect(act.type === "activity" && act.data.kind).toBe("MATCH");
});
