// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createProject } from "../src/model/factories";
import { MediaPanel } from "../src/media/MediaPanel";
import { MediaSelectionService, attachMedia } from "../src/media/service";
import { localMediaStore } from "../src/media/storage";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { StudentPreview } from "../src/player/StudentPreview";
import type { MediaCandidate, StoredMedia } from "../src/media/model";
import type { AssetReference } from "../src/model/schema";
const candidate: MediaCandidate = {
  id: "1",
  provider: "WIKIMEDIA_COMMONS",
  title: "Children using computers",
  creator: "Author",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attribution: "Author · CC BY-SA 4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Children.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
  downloadUrl: "https://upload.wikimedia.org/image.jpg",
  mimeType: "image/png",
};
const asset: AssetReference = {
  id: "local-a",
  kind: "IMAGE",
  sourceType: "UPLOAD",
  name: "Image",
  fileName: "a.png",
  mimeType: "image/png",
  size: 9,
  url: "local-media:local-a",
  altText: "Học sinh học máy tính",
  status: "LOCAL",
};
beforeEach(() => {
  vi.spyOn(localMediaStore, "get").mockResolvedValue(undefined);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:runtime-image"),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("requires teacher approval, never auto-attaches, supports rejection, retry and skip counts", async () => {
  const project = createProject();
  const attach = vi.fn();
  const service = new MediaSelectionService();
  vi.spyOn(service, "select").mockResolvedValue({ asset, caption: "credit" });
  const search = vi.fn().mockResolvedValue([candidate]);
  render(
    <MediaPanel
      project={project}
      initialSlideId={project.slides[0].id}
      close={() => {}}
      attach={attach}
      searchProvider={{ id: "test-only", search }}
      selectionService={service}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Tìm ảnh Wikimedia Commons" }),
  );
  const select = await screen.findByRole("button", { name: "Chọn ảnh" });
  expect((select as HTMLButtonElement).disabled).toBe(true);
  expect(attach).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Loại ảnh" }));
  expect(screen.queryByRole("button", { name: "Chọn ảnh" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Tìm ảnh Wikimedia Commons" }),
  );
  await screen.findByRole("button", { name: "Chọn ảnh" });
  fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã kiểm tra/ }));
  fireEvent.click(screen.getByRole("button", { name: "Chọn ảnh" }));
  await waitFor(() =>
    expect(attach).toHaveBeenCalledWith(project.slides[0].id, asset, "credit"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Trang tiếp theo" }));
  fireEvent.click(screen.getByRole("button", { name: "Bỏ qua ảnh" }));
  expect(screen.getByText(/Tổng 2 trang/).textContent).toContain("Bỏ qua 1");
  expect(attach).toHaveBeenCalledTimes(1);
});
it("shows an honest offline error and leaves manual upload enabled after review", async () => {
  render(
    <MediaPanel
      project={createProject()}
      initialSlideId={null}
      close={() => {}}
      attach={vi.fn()}
      searchProvider={{
        id: "offline-test",
        search: vi.fn().mockRejectedValue(new TypeError("offline")),
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Tìm ảnh Wikimedia Commons" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Không kết nối",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã kiểm tra/ }));
  expect(
    (screen.getByLabelText("Tải ảnh của thầy/cô") as HTMLInputElement).disabled,
  ).toBe(false);
});
it("cancels a pending search on slide navigation and ignores late results", async () => {
  let resolve!: (value: MediaCandidate[]) => void;
  let signal: AbortSignal | undefined;
  const search = vi.fn((_query: string, s?: AbortSignal) => {
    signal = s;
    return new Promise<MediaCandidate[]>((r) => {
      resolve = r;
    });
  });
  render(
    <MediaPanel
      project={createProject()}
      initialSlideId={null}
      close={() => {}}
      attach={vi.fn()}
      searchProvider={{ id: "test-only", search }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Tìm ảnh Wikimedia Commons" }),
  );
  const dropdown = screen.getByRole("combobox", {
    name: "Trang cần minh họa",
  }) as HTMLSelectElement;
  fireEvent.change(dropdown, { target: { value: dropdown.options[1].value } });
  expect(signal?.aborted).toBe(true);
  resolve([candidate]);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Chọn ảnh" })).toBeNull(),
  );
});
it("shows a useful empty-result message", async () => {
  render(
    <MediaPanel
      project={createProject()}
      initialSlideId={null}
      close={() => {}}
      attach={vi.fn()}
      searchProvider={{ id: "test-only", search: async () => [] }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Tìm ảnh Wikimedia Commons" }),
  );
  expect(await screen.findByText(/Chưa tìm thấy ảnh phù hợp/)).toBeTruthy();
});
it("restores focus and supports Escape", () => {
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  const close = vi.fn();
  const view = render(
    <MediaPanel
      project={createProject()}
      initialSlideId={null}
      close={close}
      attach={vi.fn()}
    />,
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.activeElement).toBe(button);
  button.remove();
});
it("renders stored image in existing Student Preview and revokes runtime URL on unmount", async () => {
  const project = createProject();
  const attached = attachMedia(project, project.slides[0].id, asset, "credit");
  vi.mocked(localMediaStore.get).mockResolvedValue({
    blob: new Blob(["binary"]),
  } as StoredMedia);
  const view = render(
    <StudentPreview project={attached} initialId={attached.slides[0].id} />,
  );
  const image = await screen.findByRole("img", { name: asset.altText });
  expect(image.getAttribute("src")).toBe("blob:runtime-image");
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:runtime-image");
});
it("revokes old runtime URLs on replacement and falls back to full-width text for missing JSON media", async () => {
  const project = createProject();
  const attached = attachMedia(project, project.slides[0].id, asset, "credit");
  vi.mocked(localMediaStore.get).mockResolvedValue({
    blob: new Blob(["binary"]),
  } as StoredMedia);
  const view = render(
    <SlideCanvas project={attached} slide={attached.slides[0]} />,
  );
  await screen.findByRole("img", { name: asset.altText });
  vi.mocked(localMediaStore.get).mockResolvedValue(undefined);
  const replacement = attachMedia(
    attached,
    attached.slides[0].id,
    { ...asset, id: "missing", url: "local-media:missing" },
    "",
  );
  view.rerender(
    <SlideCanvas project={replacement} slide={replacement.slides[0]} />,
  );
  expect((await screen.findByRole("alert")).textContent).toContain("Thiếu ảnh");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:runtime-image");
  expect(
    view.container.querySelector('[data-layout="TEXT_ONLY"]'),
  ).toBeTruthy();
  expect(screen.queryByRole("img", { name: asset.altText })).toBeNull();
});
it("keeps no-media slides readable without image placeholders", () => {
  const project = createProject();
  const view = render(
    <SlideCanvas project={project} slide={project.slides[1]} />,
  );
  expect(
    view.container.querySelector('[data-layout="TEXT_ONLY"]'),
  ).toBeTruthy();
  expect(within(view.container).queryByRole("img")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});
