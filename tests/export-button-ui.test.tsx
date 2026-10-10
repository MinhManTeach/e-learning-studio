// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { strFromU8, unzipSync } from "fflate";
import { createProject, createSlide } from "../src/model/factories";
import { ExportButton } from "../src/export/ExportButton";

const blobs: Blob[] = [];
beforeEach(() => {
  localStorage.clear();
  blobs.length = 0;
  URL.createObjectURL = (b: Blob | MediaSource) => {
    blobs.push(b as Blob);
    return "blob:test-" + blobs.length;
  };
  URL.revokeObjectURL = () => {};
});
afterEach(cleanup);

function lesson() {
  const p = createProject("Bài 4. Làm việc với máy tính");
  p.slides = [createSlide("welcome"), createSlide("quiz")];
  return p;
}
const props = {
  media: { get: async () => undefined },
  player: async () => ({ js: "", css: "" }),
};
async function manifestOf(link: HTMLElement) {
  expect(link.getAttribute("href")).toBe("blob:test-" + blobs.length);
  // FileReader, because jsdom's Blob may lack arrayBuffer().
  const bytes = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blobs[blobs.length - 1]);
  });
  const zip = unzipSync(new Uint8Array(bytes));
  return strFromU8(zip["imsmanifest.xml"]);
}

it("exports SCORM 1.2 unless the teacher picks another standard", async () => {
  render(<ExportButton project={lesson()} {...props} />);
  expect(screen.getByLabelText(/Chuẩn/)).toHaveProperty("value", "1.2");
  fireEvent.click(screen.getByRole("button", { name: "Xuất gói SCORM" }));
  const link = await screen.findByRole("link", { name: /Tải gói SCORM 1\.2/ });
  expect(link.getAttribute("download")).toBe(
    "bai-4-lam-viec-voi-may-tinh-scorm.zip",
  );
  expect(await manifestOf(link)).toContain(
    "<schemaversion>1.2</schemaversion>",
  );
});

it("exports SCORM 2004 when chosen and remembers the choice next time", async () => {
  const { unmount } = render(<ExportButton project={lesson()} {...props} />);
  fireEvent.change(screen.getByLabelText(/Chuẩn/), {
    target: { value: "2004" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Xuất gói SCORM" }));
  const link = await screen.findByRole("link", { name: /Tải gói SCORM 2004/ });
  expect(link.getAttribute("download")).toBe(
    "bai-4-lam-viec-voi-may-tinh-scorm2004.zip",
  );
  expect(await manifestOf(link)).toContain("2004 4th Edition");
  unmount();
  render(<ExportButton project={lesson()} {...props} />);
  expect(screen.getByLabelText(/Chuẩn/)).toHaveProperty("value", "2004");
});

it("hides an old download when the standard changes, so the wrong file is not uploaded", async () => {
  render(<ExportButton project={lesson()} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Xuất gói SCORM" }));
  await screen.findByRole("link", { name: /Tải gói SCORM 1\.2/ });
  fireEvent.change(screen.getByLabelText(/Chuẩn/), {
    target: { value: "2004" },
  });
  expect(screen.queryByRole("link", { name: /Tải gói/ })).toBeNull();
});
