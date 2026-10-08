// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { backupFixture } from "./fixtures/backup";
import { createBackup } from "../src/backup/package";
import { restoreBackup } from "../src/backup/restore";
import { localMediaStore } from "../src/media/storage";
import { openIndexedStore } from "../src/storage/projects";
import { StudentPreview } from "../src/player/StudentPreview";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("resolves restored IndexedDB media through the unchanged Student Preview renderer", async () => {
  vi.stubGlobal("Blob", NodeBlob);
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/restored-image");
  URL.revokeObjectURL = vi.fn();
  const { p, media } = await backupFixture();
  p.slides[0].layout = "TEXT_LEFT_MEDIA_RIGHT";
  p.slides[0].media.caption = "Teacher · CC BY · source";
  const target = await openIndexedStore(factory, "render-projects");
  const restored = await restoreBackup(
    await createBackup(p, media),
    target,
    localMediaStore,
  );
  render(
    <StudentPreview project={restored} initialId={restored.slides[0].id} />,
  );
  const image = await screen.findByRole("img", { name: "Ảnh" });
  expect(image.getAttribute("src")).toBe(
    "blob:http://localhost/restored-image",
  );
  expect(screen.getByText("Teacher · CC BY · source")).toBeTruthy();
  expect(restored.slides[1]).toEqual(p.slides[1]);
  expect(restored.slides[2]).toEqual(p.slides[2]);
});
