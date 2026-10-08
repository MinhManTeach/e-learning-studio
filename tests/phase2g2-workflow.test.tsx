// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MediaPanel } from "../src/media/MediaPanel";
import { createProject } from "../src/model/factories";
import { parseProject } from "../src/model/schema";
import { localMediaStore } from "../src/media/storage";
import { attachMedia } from "../src/media/service";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import { StudentPreview } from "../src/player/StudentPreview";
const placement = {
  id: "p1",
  relationshipId: "rId4",
  mediaId: "word/media/x.png",
  status: "VALID",
  blockId: "b1",
  sourceOrder: 1,
  row: 3,
  column: 0,
  paragraphIndex: 2,
  imageOrder: 0,
  nearbyText: "Quan sát thiết bị",
  altText: "Sơ đồ máy tính",
  caption: "Sơ đồ",
  activityTitle: "Khám phá",
  needsReview: false,
};
function fixture() {
  const p = createProject();
  return parseProject({
    ...p,
    assets: [
      {
        id: "source",
        kind: "IMAGE",
        sourceType: "UPLOAD",
        status: "LOCAL",
        name: "Source",
        url: "local-media:source",
        altText: "Sơ đồ máy tính",
        mimeType: "image/png",
        docxSource: {
          documentId: "d",
          fileName: "synthetic.docx",
          checksum: "a".repeat(64),
          license: "USER_PROVIDED_UNVERIFIED",
          attribution: "Nguồn KHBD · quyền chưa xác minh",
          placements: [placement],
        },
      },
    ],
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function storage() {
  vi.spyOn(localMediaStore, "get").mockResolvedValue({
    assetId: "source",
    projectId: "p",
    blob: new Blob(["png"], { type: "image/png" }),
    mimeType: "image/png",
    size: 3,
    source: {
      title: "Source",
      provider: "DOCX",
      sourceUrl: "",
      creator: "Teacher",
      license: "USER_PROVIDED_UNVERIFIED",
      licenseUrl: "",
      attribution: "Nguồn KHBD",
    },
  });
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:docx-test"),
      revokeObjectURL: vi.fn(),
    }),
  );
}
it("shows source images first, requires teacher approval and permits explicit Wikimedia fallback", async () => {
  storage();
  const p = fixture(),
    attach = vi.fn(),
    search = vi.fn().mockResolvedValue([]);
  render(
    <MediaPanel
      project={p}
      initialSlideId={null}
      close={() => {}}
      attach={attach}
      searchProvider={{ id: "test", search }}
    />,
  );
  const choose = await screen.findByRole("button", {
    name: "Chọn ảnh nguồn 1",
  });
  await waitFor(() =>
    expect(screen.getByAltText("Sơ đồ máy tính").getAttribute("src")).toBe(
      "blob:docx-test",
    ),
  );
  expect((choose as HTMLButtonElement).disabled).toBe(true);
  expect(attach).not.toHaveBeenCalled();
  const commons = screen.getByRole("button", {
    name: "Tìm ảnh Wikimedia Commons",
  });
  expect((commons as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã kiểm tra/ }));
  fireEvent.click(choose);
  await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
  expect(search).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Ảnh nguồn chưa phù hợp/ }),
  );
  fireEvent.click(commons);
  await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
});
it("renders the selected source binary in the existing Editor canvas and Student Preview after JSON reopen", async () => {
  storage();
  const p = fixture();
  const selected = attachMedia(p, p.slides[0].id, p.assets[0], "Nguồn KHBD");
  const restored = parseProject(JSON.parse(JSON.stringify(selected)));
  const editor = render(
    <SlideCanvas project={restored} slide={restored.slides[0]} />,
  );
  await waitFor(() =>
    expect(screen.getByAltText("Sơ đồ máy tính").getAttribute("src")).toBe(
      "blob:docx-test",
    ),
  );
  editor.unmount();
  render(
    <StudentPreview project={restored} initialId={restored.slides[0].id} />,
  );
  await waitFor(() =>
    expect(screen.getByAltText("Sơ đồ máy tính").getAttribute("src")).toBe(
      "blob:docx-test",
    ),
  );
});
it("does not attach a missing source binary", async () => {
  storage();
  vi.mocked(localMediaStore.get).mockResolvedValue(undefined);
  const attach = vi.fn();
  render(
    <MediaPanel
      project={fixture()}
      initialSlideId={null}
      close={() => {}}
      attach={attach}
    />,
  );
  await screen.findByText(/Thiếu ảnh trên thiết bị/);
  fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã kiểm tra/ }));
  expect(
    (
      screen.getByRole("button", {
        name: "Chọn ảnh nguồn 1",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(attach).not.toHaveBeenCalled();
});
