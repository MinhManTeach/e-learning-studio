// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PptxImport } from "../src/import/pptx/PptxImport";
import type { LessonProject } from "../src/model/schema";
import type { StoredMedia } from "../src/media/model";
import { buildPptx, picture, pngBytes, text } from "./support/pptxFixture";

afterEach(cleanup);

function lessonFile() {
  const bytes = buildPptx(
    [
      {
        shapes: [
          text(2, "KHỞI ĐỘNG", { x: 10, y: 5, w: 40, h: 10 }),
          picture(3, "rIdP", { x: 55, y: 20, w: 35, h: 60 }),
        ],
        rels: { rIdP: { type: "image", target: "../media/image1.png" } },
      },
      {
        shapes: [
          text(2, "Điều khiển chuột là điều khiển con trỏ. Đúng hay Sai?", {
            x: 15,
            y: 30,
            w: 70,
            h: 20,
          }),
          text(3, "A. ĐÚNG", { x: 18, y: 77, w: 17, h: 8 }),
          text(4, "B. SAI", { x: 68, y: 77, w: 12, h: 8 }),
        ],
      },
      {
        shapes: [text(2, "Ghi chú riêng", { x: 10, y: 5, w: 40, h: 10 })],
      },
    ],
    { "image1.png": pngBytes },
  );
  return new File([new Uint8Array(bytes)], "Bai_4_tiet_2.pptx");
}
function setup() {
  const saved: LessonProject[] = [];
  const stored: StoredMedia[] = [];
  const open = vi.fn();
  const store = {
    list: async () => ({ projects: [], invalidCount: 0 }),
    save: async (p: LessonProject) => void saved.push(p),
    remove: async () => {},
  };
  render(
    <PptxImport
      store={store}
      media={{ put: async (m) => void stored.push(m) }}
      open={open}
      onClose={() => {}}
    />,
  );
  return { saved, stored, open };
}

it("reads a PowerPoint, lets the teacher review it, and creates the lesson", async () => {
  const { saved, stored, open } = setup();
  fireEvent.change(screen.getByLabelText("Tệp PowerPoint"), {
    target: { files: [lessonFile()] },
  });
  fireEvent.change(screen.getByLabelText("Ảnh các slide"), {
    target: {
      files: [
        new File([new Uint8Array(pngBytes)], "Slide1.PNG", {
          type: "image/png",
        }),
      ],
    },
  });
  expect(
    (screen.getByRole("textbox", { name: "Tên bài giảng" }) as HTMLInputElement)
      .value,
  ).toBe("Bai 4 tiet 2");
  fireEvent.change(screen.getByRole("textbox", { name: "Môn học" }), {
    target: { value: "Tin học" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đọc PowerPoint" }));

  expect(
    await screen.findByText(/Tìm thấy 3 trang dùng được, 1 ảnh slide/),
  ).toBeTruthy();
  expect(screen.getByText("· Hãy chọn đáp án đúng")).toBeTruthy();
  // The teacher marks B as correct and drops slide 3.
  fireEvent.click(screen.getByRole("radio", { name: "B. SAI" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Giữ slide 3" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề slide 1" }), {
    target: { value: "Khởi động" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Tạo bài giảng (2 trang)" }),
  );

  await waitFor(() => expect(open).toHaveBeenCalledOnce());
  const project = saved[0];
  expect(open.mock.calls[0][0]).toBe(project);
  expect(project.metadata).toMatchObject({
    projectTitle: "Bai 4 tiet 2",
    subject: "Tin học",
  });
  expect(project.slides.map((s) => s.title)).toEqual([
    "Khởi động",
    "Điều khiển chuột là điều khiển con trỏ. Đúng hay Sai?",
    "Hoàn thành bài học",
  ]);
  const quiz = project.slides[1];
  expect(
    quiz.type === "quiz" && quiz.data.questions[0].correctAnswerIndex,
  ).toBe(1);
  expect(project.slides[0].layout).toBe("MEDIA_COVER");
  expect(stored.map((m) => m.assetId)).toEqual(["slide-1"]);
});

it("shows what still needs checking before opening the lesson", async () => {
  const { open } = setup();
  fireEvent.change(screen.getByLabelText("Tệp PowerPoint"), {
    target: { files: [lessonFile()] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đọc PowerPoint" }));
  await screen.findByText(/Tìm thấy 3 trang/);
  fireEvent.click(
    screen.getByRole("button", { name: "Tạo bài giảng (3 trang)" }),
  );
  expect(await screen.findByText(/chưa rõ đáp án đúng/)).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Mở bài giảng" }));
  expect(open).toHaveBeenCalledOnce();
});

it("explains when the file is not a PowerPoint", async () => {
  setup();
  fireEvent.change(screen.getByLabelText("Tệp PowerPoint"), {
    target: { files: [new File([new Uint8Array([1, 2, 3])], "bai.pptx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đọc PowerPoint" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Tệp không phải PowerPoint (.pptx) hợp lệ.",
  );
});
