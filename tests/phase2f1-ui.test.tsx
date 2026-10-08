// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BackupButton } from "../src/backup/BackupButton";
import { RestoreControl } from "../src/backup/RestoreControl";
import { createProject } from "../src/model/factories";
vi.mock("../src/backup/package", () => ({
  createBackup: vi.fn(),
  inspectBackup: vi.fn(),
}));
vi.mock("../src/backup/restore", () => ({ restoreBackup: vi.fn() }));
import { createBackup, inspectBackup } from "../src/backup/package";
import { restoreBackup } from "../src/backup/restore";
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  URL.createObjectURL = vi.fn(() => "blob:test-download");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("offers a real download link only after complete packaging and reports missing-media errors", async () => {
  vi.mocked(createBackup)
    .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
    .mockRejectedValueOnce(
      new Error("Thiếu hình ảnh trong bản sao lưu: trang 3, asset image"),
    );
  render(<BackupButton project={createProject()} />);
  fireEvent.click(screen.getByRole("button", { name: "Sao lưu bài giảng" }));
  expect(
    await screen.findByRole("link", { name: "Tải bản sao lưu ZIP" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Tải bản sao lưu ZIP" })
      .getAttribute("download"),
  ).toBe("e-learning-backup.zip");
  fireEvent.click(screen.getByRole("button", { name: "Sao lưu bài giảng" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Thiếu hình ảnh"),
  );
  expect(
    screen.queryByRole("link", { name: "Tải bản sao lưu ZIP" }),
  ).toBeNull();
});
it("summarizes conflict, requires confirmation, allows cancellation and opens only a successful copy", async () => {
  const p = createProject(),
    copy = { ...p, projectId: "restored-copy" };
  vi.mocked(inspectBackup).mockResolvedValue({
    project: p,
    media: [],
    manifest: { unattachedSuggestions: [] },
  } as unknown as Awaited<ReturnType<typeof inspectBackup>>);
  vi.mocked(restoreBackup).mockResolvedValue(copy);
  const store = {
      list: async () => ({ projects: [p], invalidCount: 0 }),
      save: vi.fn(),
      remove: vi.fn(),
      saveNew: vi.fn(),
    },
    open = vi.fn();
  render(<RestoreControl store={store} open={open} />);
  const file = Object.assign(new File(["zip"], "lesson.zip"), {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  const input = screen.getByLabelText("Tệp sao lưu bài giảng ZIP");
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole("dialog");
  expect(screen.getByText(/đã có trên thiết bị/)).toBeTruthy();
  expect(restoreBackup).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole("dialog");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Khôi phục thành bản sao",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Khôi phục thành công"),
  );
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Mở bài giảng đã khôi phục" }),
  );
  expect(open).toHaveBeenCalledWith(copy);
});
