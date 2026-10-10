# Bàn giao giữa các phiên Claude (cập nhật 2026-10-10)

## Trạng thái nhánh
- `main` có: 6 sửa lỗi Bài 4, xuất SCORM 1.2 + HTML5, mục lục trái, giấy chứng nhận, nhập PowerPoint.
- Gói SCORM đã chạy thật trên LMS360.vn của trường (người dùng xác nhận 2026-10-10).
- Codex không còn review. Quy tắc: mọi thay đổi có test, mỗi lỗi một commit. Người dùng cho phép merge vào main khi CI xanh.

## Chạy test trên máy người dùng (Windows, F:\Codex\e-learning-studio)
- `powershell -ExecutionPolicy Bypass -File .\claude-dev.ps1` (để cửa sổ mở). Không commit: claude-dev.ps1, claude-runner.mjs, claude-export.mjs, .claude-dev/.
- Gửi việc: ghi JSON vào `.claude-dev\inbox\`, đọc kết quả ở `.claude-dev\outbox\`.
  Ví dụ: `{"action":"ci"}`, `{"action":"test","args":{"files":["tests/x.test.ts"]}}`,
  `{"action":"git","args":{"cmd":"pull"}}`, `{"action":"export-lesson","args":{"name":"bai4-tiet1-v2"}}`,
  `{"action":"pptx-lesson","args":{"name":"bai4-tiet3"}}` (work/<name>/lesson.pptx + slides/ + meta.json).
- Tệp > 30 MB chuyển sang máy: SendUserFile rồi device_commit_files với fileUuid.
- Runner tự khởi động lại khi claude-runner.mjs thay đổi.

## Người dùng
- Giáo viên Tin học tiểu học, dùng LMS360.vn. Có PowerPoint mỗi tiết (nhiều tranh, video) + KHBD Word nhiều tiết.
- Muốn bài sinh động cho học sinh tiểu học: giữ hình slide gốc, có video.
- Demo Bài 4 – Tiết 1 bản 2 đã gửi (9,8 MB). Chờ: thử video trên Chrome/Edge, thử tải lên LMS360.

## Việc tiếp theo
1. Người dùng thử "Nhập PowerPoint" trong app với tiết 2 (có video) + ảnh slide xuất từ PowerPoint.
2. Trang câu hỏi còn trơn so với ảnh slide: cân nhắc dùng ảnh slide làm nền/tranh cho trang câu hỏi.
3. Trang chặng (ảnh "Khởi động", "Khám phá"…) có tiêu đề "Trang N": đoán tên từ chặng kế tiếp.
4. Nén video khi xuất (video gốc tiết 1 tới 25 MB); sao lưu (backup) chưa hỗ trợ video.
5. Trình phát trên điện thoại dọc (khung 16:9 thấp).
6. Việc cũ: gắn YCCĐ vào trang hoạt động, chọn YCCĐ theo tiết, xác nhận hàng loạt câu hỏi.
