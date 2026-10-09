# Bàn giao giữa các phiên Claude (cập nhật 2026-10-09)

## Trạng thái nhánh
- `main` = f2e261b. Chưa merge gì mới (cần người dùng nói rõ "merge vào main").
- `claude/outcomes-under-competencies` (65e91d1): 6 sửa lỗi Bài 4, CI xanh 641/641, chờ merge.
- `claude/lms-export` (tách từ nhánh trên): xuất gói SCORM 1.2 + HTML5 offline, CI xanh 691/691.
  - Nút "Xuất gói SCORM" trong trình soạn; trình phát học sinh (mục lục, A−/A+, đổi màu, toàn màn hình, đọc bài, học tiếp).
  - Video trong trang (MP4/WebM), bố cục "Ảnh/video phủ kín trang" (MEDIA_COVER), tranh trên đáp án (imageAssetId).
- Codex không còn review. Quy tắc: mọi thay đổi có test, mỗi lỗi một commit.

## Chạy test trên máy người dùng (Windows, F:\Codex\e-learning-studio)
- `powershell -ExecutionPolicy Bypass -File .\claude-dev.ps1` (để cửa sổ mở). Không commit: claude-dev.ps1, claude-runner.mjs, claude-export.mjs, .claude-dev/.
- Gửi việc: ghi JSON vào `.claude-dev\inbox\`, đọc kết quả ở `.claude-dev\outbox\`.
  Ví dụ: `{"action":"ci"}`, `{"action":"test","args":{"files":["tests/x.test.ts"]}}`,
  `{"action":"git","args":{"cmd":"pull"}}`, `{"action":"export-lesson","args":{"name":"bai4-tiet1-v2"}}`.
- Runner tự khởi động lại khi claude-runner.mjs thay đổi.

## Người dùng
- Giáo viên Tin học tiểu học, dùng LMS360.vn. Có PowerPoint mỗi tiết (nhiều tranh, video) + KHBD Word nhiều tiết.
- Muốn bài sinh động cho học sinh tiểu học: giữ hình slide gốc, có video.
- Demo Bài 4 – Tiết 1 bản 2 đã gửi (9,8 MB). Chờ: thử video trên Chrome/Edge, thử tải lên LMS360.

## Việc tiếp theo (theo thứ tự)
1. Nhập PowerPoint: ảnh slide (giáo viên xuất PNG từ PowerPoint), video, tách tranh đáp án,
   nhận đáp án đúng từ liên kết slide ("CHÍNH XÁC!") và hiệu ứng bấm phát âm "đúng"; lọc chữ "NotebookLM".
2. Kho media trong app nhận video (hiện IndexedDB chỉ nhận ảnh ≤ 8 MB); nén video khi xuất.
3. Trình phát trên điện thoại dọc (khung 16:9 quá thấp).
4. Việc cũ: gắn YCCĐ vào trang hoạt động (so khớp gần đúng), chọn YCCĐ theo tiết, xác nhận hàng loạt câu hỏi.
