// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { z } from "zod";
import { TextRenderer } from "../src/renderers/StaticRenderers";
import { StudentPreview } from "../src/player/StudentPreview";
import { Editor } from "../src/editor/Editor";
import { SlideProperties } from "../src/editor/SlideProperties";
import { createProject, createSlide } from "../src/model/factories";

afterEach(cleanup);

describe("text slide rendering", () => {
  it("does not render blank lines as empty bullets, paragraphs or keywords", () => {
    const slide = createSlide("content");
    slide.data.bulletPoints = ["Ý một", "", "  ", "Ý hai", ""];
    slide.data.paragraphs = ["Đoạn", ""];
    slide.data.keywords = ["", "web"];
    const { container } = render(<TextRenderer slide={slide} />);
    expect(
      [...container.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["Ý một", "Ý hai"]);
    expect(container.querySelectorAll(".keywords span")).toHaveLength(1);
    expect(
      [...container.querySelectorAll("p:not(.body-text)")].map(
        (p) => p.textContent,
      ),
    ).toEqual(["Đoạn"]);
  });
});

describe("student preview keyboard navigation", () => {
  it("keeps arrow-key navigation after clicking the next-page button", () => {
    const project = createProject();
    project.slides.push(createSlide("content"));
    render(<StudentPreview project={project} initialId={null} />);
    const next = screen.getByRole("button", { name: /Trang tiếp/ });
    fireEvent.click(next);
    expect(screen.getByText("Trang 2 / 3")).toBeTruthy();
    fireEvent.keyDown(next, { key: "ArrowRight" });
    expect(screen.getByText("Trang 3 / 3")).toBeTruthy();
  });
});

describe("editor save errors", () => {
  it("explains invalid lesson data separately from storage problems", async () => {
    const save = vi.fn(async () => {
      z.string().min(1).parse("");
    });
    render(
      <Editor
        project={createProject("Bài thử")}
        store={{
          list: async () => ({ projects: [], invalidCount: 0 }),
          save,
          remove: vi.fn(),
        }}
        back={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    });
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toContain("dữ liệu chưa hợp lệ");
    expect(alert).not.toContain("dung lượng");
  });
});

describe("pedagogical stage field", () => {
  it("shows an unset stage as unset and can clear a chosen stage", () => {
    const project = createProject();
    const slide = { ...project.slides[1], pedagogicalStage: undefined };
    const edit = vi.fn();
    render(
      <SlideProperties
        slide={slide}
        project={project}
        edit={edit}
        mediaChange={vi.fn()}
      />,
    );
    const select = screen.getByRole("combobox", {
      name: "Giai đoạn sư phạm",
    }) as HTMLSelectElement;
    expect(select.value).toBe("");
    fireEvent.change(select, { target: { value: "PRACTICE" } });
    expect(edit.mock.lastCall?.[0].pedagogicalStage).toBe("PRACTICE");
    fireEvent.change(select, { target: { value: "" } });
    expect(edit.mock.lastCall?.[0].pedagogicalStage).toBeUndefined();
  });
});
