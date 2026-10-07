// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonImportWizard } from "../src/import/LessonImportWizard";

afterEach(cleanup);
async function confirm() {
  fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã kiểm tra/ }));
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận & tiếp tục" }));
  await screen.findByRole("heading", { name: "Đề xuất kịch bản bài giảng" });
}
it("retains edited current blueprint and approval during navigation, invalidating only when analysis changes", async () => {
  const { rerender } = render(
    <LessonImportWizard active initialMode="paste" onClose={() => {}} />,
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Nội dung kế hoạch bài dạy" }),
    {
      target: {
        value:
          "Môn: Toán\nLớp: 3\nBài: Phép cộng\nThời lượng: 25 phút\nYêu cầu cần đạt:\n- Thực hiện phép cộng.\nNội dung trọng tâm:\n- Cộng hai số.",
      },
    },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Phân tích kế hoạch bài dạy" }),
  );
  await screen.findByRole("heading", { name: "Đã phân tích kế hoạch bài dạy" });
  await confirm();
  fireEvent.click(screen.getByRole("button", { name: "Sửa trang 1" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề trang" }), {
    target: { value: "Chào lớp mình" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Xong" }));
  fireEvent.click(screen.getByRole("button", { name: "Duyệt kịch bản" }));
  rerender(
    <LessonImportWizard
      active={false}
      initialMode="paste"
      onClose={() => {}}
    />,
  );
  expect(
    screen.queryByRole("heading", { name: "Đề xuất kịch bản bài giảng" }),
  ).toBeNull();
  rerender(
    <LessonImportWizard active initialMode="paste" onClose={() => {}} />,
  );
  expect(screen.getByRole("heading", { name: "Chào lớp mình" })).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Đã duyệt kịch bản",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Kiểm tra lại nội dung" }),
  );
  await confirm();
  expect(screen.getByRole("heading", { name: "Chào lớp mình" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Kiểm tra lại nội dung" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Tên bài học" }), {
    target: { value: "Phép cộng đã sửa" },
  });
  await confirm();
  expect(screen.queryByRole("heading", { name: "Chào lớp mình" })).toBeNull();
  expect(
    screen.getAllByRole("heading", { name: "Phép cộng đã sửa" }).length,
  ).toBeGreaterThan(0);
  expect(
    (screen.getByRole("button", { name: /Tạo bài giảng/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
