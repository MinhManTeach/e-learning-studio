// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { parsePptx } from "../src/import/pptx/parse";
import { analyzeDeck } from "../src/import/pptx/analyze";
import { buildLessonFromPptx } from "../src/import/pptx/build";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import {
  ImageResolverContext,
  packagedImageResolver,
} from "../src/media/imageResolver";
import type { LessonProject, Slide } from "../src/model/schema";
import { buildPptx, picture, pngBytes, text } from "./support/pptxFixture";

afterEach(cleanup);
// The slide is drawn 1000 × 500 px on screen, so 10 px is 1% across.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 500,
    width: 1000,
    height: 500,
    toJSON: () => ({}),
  });
});
afterEach(() => vi.restoreAllMocks());

/** A plain slide (no sounds): a title, a text box and a picture. */
function lesson() {
  const bytes = buildPptx(
    [
      {
        shapes: [
          text(2, "Nhịp 2/4", { x: 5, y: 3, w: 60, h: 12 }, { title: true }),
          text(3, ["Mạnh – nhẹ."], { x: 5, y: 20, w: 40, h: 20 }),
          picture(4, "rIdP", { x: 50, y: 20, w: 20, h: 40 }, { name: "Trống" }),
        ],
        rels: { rIdP: { type: "image", target: "../media/image1.png" } },
      },
    ],
    { "image1.png": pngBytes },
  );
  return buildLessonFromPptx({
    title: "Âm nhạc",
    subject: "",
    grade: "",
    pages: analyzeDeck(parsePptx(bytes)).pages,
    pptx: bytes,
    slidePictures: [],
  }).project;
}

/** The editor canvas, keeping each edit like the editor does. */
function Editing({
  project,
  edits,
}: {
  project: LessonProject;
  edits: Slide[];
}) {
  const [slide, setSlide] = useState(project.slides[0]);
  return (
    <ImageResolverContext.Provider
      value={packagedImageResolver(
        Object.fromEntries(project.assets.map((a) => [a.id, `media/${a.id}`])),
        "https://lms.example/sco/",
      )}
    >
      <SlideCanvas
        slide={slide}
        project={project}
        onEdit={(s) => {
          edits.push(s);
          setSlide(s);
        }}
      />
    </ImageResolverContext.Provider>
  );
}

function setup() {
  const project = lesson();
  const edits: Slide[] = [];
  const view = render(<Editing project={project} edits={edits} />);
  const item = (label: string) =>
    view.container.querySelector<HTMLElement>(
      `[data-item="${itemId(label)}"]`,
    )!;
  const items = () => {
    const s = edits.at(-1) ?? project.slides[0];
    return s.type === "content" ? s.data.original!.items : [];
  };
  const itemId = (label: string) =>
    items().find((i) =>
      label === "picture" ? i.kind === "IMAGE" : i.text.includes(label),
    )!.id;
  const last = (label: string) => items().find((i) => i.id === itemId(label))!;
  return { view, edits, item, last };
}

/** A mouse drag on the window, as the browser sends it. */
function drag(from: Element, dx: number, dy: number, shift = false) {
  fireEvent.pointerDown(from, { button: 0, clientX: 100, clientY: 100 });
  act(() => {
    window.dispatchEvent(
      new MouseEvent("pointermove", {
        clientX: 100 + dx,
        clientY: 100 + dy,
        shiftKey: shift,
      }),
    );
    window.dispatchEvent(new MouseEvent("pointerup"));
  });
}

it("keeps a plain slide as the teacher laid it out", () => {
  const project = lesson();
  const [page] = project.slides;
  if (page.type !== "content") throw new Error("expected content");
  expect(page.data.original?.items.map((i) => [i.kind, i.x, i.y])).toEqual([
    ["TEXT", 5, 3],
    ["TEXT", 5, 20],
    ["IMAGE", 50, 20],
  ]);
});

it("moves a text box with the mouse in one edit", () => {
  const { item, edits, last } = setup();
  drag(item("Mạnh – nhẹ."), 100, 50);
  // 100 px of 1000 is 10% across; 50 px of 500 is 10% down.
  expect(edits).toHaveLength(1);
  expect(last("Mạnh – nhẹ.")).toMatchObject({ x: 15, y: 30, w: 40, h: 20 });
});

it("does not change the page on a plain click", () => {
  const { item, edits } = setup();
  drag(item("Mạnh – nhẹ."), 0, 0);
  expect(edits).toHaveLength(0);
});

it("resizes a picture from its corner and keeps its shape", () => {
  const { item, edits, last, view } = setup();
  fireEvent.pointerDown(item("picture"), { button: 0 });
  act(() => window.dispatchEvent(new MouseEvent("pointerup")));
  const handle = view.container.querySelector(".edit-handle")!;
  drag(handle, 100, 0);
  expect(edits).toHaveLength(1);
  expect(last("picture")).toMatchObject({ x: 50, y: 20, w: 30, h: 60 });
  // Shift lets the picture change shape.
  drag(view.container.querySelector(".edit-handle")!, 0, 50, true);
  expect(last("picture")).toMatchObject({ w: 30, h: 70 });
});

it("types new words into a text box", () => {
  const { item, last } = setup();
  fireEvent.doubleClick(item("Mạnh – nhẹ."));
  const box = screen.getByLabelText("Sửa chữ trên slide");
  box.innerText = "Mạnh – nhẹ – nhẹ.\nĐếm 1 – 2.";
  fireEvent.blur(box);
  expect(last("Mạnh – nhẹ – nhẹ.").text).toEqual([
    "Mạnh – nhẹ – nhẹ.",
    "Đếm 1 – 2.",
  ]);
});

it("removes, enlarges and adds items from the toolbar and keyboard", () => {
  const { item, last, edits, view } = setup();
  fireEvent.pointerDown(item("Mạnh – nhẹ."), { button: 0 });
  act(() => window.dispatchEvent(new MouseEvent("pointerup")));
  fireEvent.click(screen.getByRole("button", { name: "A+" }));
  expect(last("Mạnh – nhẹ.").size).toBeGreaterThan(2.4);
  fireEvent.keyDown(view.container.querySelector(".original-slide")!, {
    key: "ArrowRight",
  });
  expect(last("Mạnh – nhẹ.").x).toBe(5.5);
  fireEvent.keyDown(view.container.querySelector(".original-slide")!, {
    key: "Delete",
  });
  const after = edits.at(-1)!;
  if (after.type !== "content") throw new Error("expected content");
  expect(after.data.original!.items.map((i) => i.text[0])).not.toContain(
    "Mạnh – nhẹ.",
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm chữ" }));
  expect(screen.getByLabelText("Sửa chữ trên slide")).toBeTruthy();
});

it("changes when an item appears as the student clicks", () => {
  const { item, last } = setup();
  fireEvent.pointerDown(item("picture"), { button: 0 });
  act(() => window.dispatchEvent(new MouseEvent("pointerup")));
  fireEvent.change(screen.getByLabelText("Xuất hiện"), {
    target: { value: "1" },
  });
  expect(last("picture").step).toBe(1);
  fireEvent.change(screen.getByLabelText("Xuất hiện"), {
    target: { value: "0" },
  });
  expect(last("picture").step).toBeUndefined();
});
