// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dashboard } from "../src/Dashboard";
import { createProject } from "../src/model/factories";
import type { ProjectStore } from "../src/storage/projects";

afterEach(cleanup);

function renderHome(projects = [createProject("Bài 4 – Tiết 1")]) {
  const store = {
    list: async () => ({ projects, invalidCount: 0 }),
    save: vi.fn(),
    remove: vi.fn(),
  } as unknown as ProjectStore;
  const startImport = vi.fn();
  render(<Dashboard store={store} open={vi.fn()} startImport={startImport} />);
  return { startImport };
}

describe("teacher start page", () => {
  it("starts each way of making a lesson from its own card", () => {
    const { startImport } = renderHome();
    fireEvent.click(screen.getByRole("button", { name: /Nhập tệp kế hoạch/ }));
    expect(startImport).toHaveBeenLastCalledWith("file");
    fireEvent.click(
      screen.getByRole("button", { name: /Dán nội dung kế hoạch/ }),
    );
    expect(startImport).toHaveBeenLastCalledWith("paste");
  });

  it("lists the teacher's lessons with their count and last edit", async () => {
    renderHome();
    expect(
      await screen.findByRole("heading", { name: /Bài giảng của tôi\s*1/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Sửa ngày/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Xem bài mẫu/ })).toBeTruthy();
  });

  it("links the terms and privacy pages from the footer", () => {
    renderHome();
    const legal = screen.getByRole("navigation", { name: "Pháp lý" });
    const href = (name: string) =>
      screen.getByRole("link", { name }).getAttribute("href");
    expect(href("Điều khoản sử dụng")).toBe("/dieu-khoan");
    expect(href("Chính sách bảo mật")).toBe("/chinh-sach-bao-mat");
    expect(legal.contains(screen.getByRole("link", { name: "Liên hệ" }))).toBe(
      true,
    );
  });
});
