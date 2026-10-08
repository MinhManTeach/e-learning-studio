// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QualityPanel } from "../src/quality/QualityPanel";
import { createProject, createSlide } from "../src/model/factories";
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("previews and rejects without applying, and only applies after explicit approval", () => {
  const p = createProject();
  p.slides = [createSlide("objectives")];
  p.slides[0].title = "Mục tiêu nguồn";
  const apply = vi.fn();
  const props = { project: p, close: vi.fn(), navigate: vi.fn(), apply };
  const view = render(<QualityPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem trước OBJECTIVES" }));
  expect(
    screen.getByRole("region", { name: "Xem trước đề xuất" }),
  ).toBeTruthy();
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bỏ qua OBJECTIVES" }));
  expect(apply).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("region", { name: "Xem trước đề xuất" }),
  ).toBeNull();
  view.unmount();
  render(<QualityPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem trước OBJECTIVES" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Duyệt và áp dụng đề xuất" }),
  );
  expect(apply).toHaveBeenCalledOnce();
  expect(p.slides[0].title).toBe("Mục tiêu nguồn");
});
