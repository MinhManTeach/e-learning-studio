// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LocalMediaAssetStore } from "../src/media/storage";
import { Dashboard } from "../src/Dashboard";
import { createProject } from "../src/model/factories";

afterEach(cleanup);
const png = () =>
  new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], {
    type: "image/png",
  });
const media = (projectId: string, assetId: string) => ({
  assetId,
  projectId,
  blob: png(),
  mimeType: "image/png",
  size: 9,
  source: {
    title: "Upload",
    provider: "UPLOAD" as const,
    sourceUrl: "",
    creator: "",
    license: "USER_PROVIDED",
    licenseUrl: "",
    attribution: "",
  },
});

describe("media cleanup when a lesson is deleted", () => {
  it("removes every image of one project and keeps other projects' images", async () => {
    const store = new LocalMediaAssetStore(new IDBFactory(), "cleanup-test");
    await store.put(media("p1", "a"));
    await store.put(media("p1", "b"));
    await store.put(media("p10", "a"));
    await store.put(media("p2", "a"));
    await store.removeProject("p1");
    expect(await store.get("a", "p1")).toBeUndefined();
    expect(await store.get("b", "p1")).toBeUndefined();
    expect(await store.get("a", "p10")).toBeDefined();
    expect(await store.get("a", "p2")).toBeDefined();
  });

  async function deleteFromDashboard(
    removeProject: (id: string) => Promise<void>,
  ) {
    const project = createProject("Bài có ảnh");
    let saved = [project];
    const store = {
      list: async () => ({ projects: saved, invalidCount: 0 }),
      save: vi.fn(),
      remove: vi.fn(async (id: string) => {
        saved = saved.filter((p) => p.projectId !== id);
      }),
    };
    render(
      <Dashboard
        store={store}
        open={vi.fn()}
        startImport={vi.fn()}
        media={{ removeProject }}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Xóa bài giảng Bài có ảnh" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Xóa bài giảng" }));
    await waitFor(() => expect(store.remove).toHaveBeenCalled());
    return project;
  }
  it("deletes the lesson's images from the dashboard", async () => {
    const removeProject = vi.fn(async () => {});
    const project = await deleteFromDashboard(removeProject);
    await waitFor(() =>
      expect(removeProject).toHaveBeenCalledWith(project.projectId),
    );
  });
  it("still deletes the lesson when image cleanup fails", async () => {
    await deleteFromDashboard(async () => {
      throw new Error("media db blocked");
    });
    await waitFor(() => expect(screen.queryByText("Bài có ảnh")).toBeNull());
    expect(
      screen.queryByText("Chưa xóa được bài giảng. Hãy thử lại."),
    ).toBeNull();
  });
});
