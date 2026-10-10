# Bàn giao giữa các phiên Claude (cập nhật 2026-10-10)

## Trạng thái nhánh
- `main` có: 6 sửa lỗi Bài 4, xuất SCORM 1.2 + HTML5, mục lục trái, giấy chứng nhận, nhập PowerPoint.
- Nhánh `claude/import-cleanup-ai` (chưa merge, CI xanh trên máy người dùng; máy đang ở nhánh này):
  - Nhập PowerPoint sạch hơn: bỏ panel/khung/hình phẳng (bytes/pixel từ header ảnh), nối dòng bị cắt,
    đọc theo hàng, bỏ nhãn lặp, slide chỉ có tranh → trang phủ kín + nhắc "Đặt tên trang".
  - "AI làm đẹp bài giảng" (src/ai/, server/studio.ts, gemini.ts, anthropic.ts): khoá của người dùng trong
    `.env.local`. Chữ: Gemini (mặc định gemini-3.8-flash, thinking low) hoặc Claude (sonnet-5-5;
    khoá `sk-ant-` tự nhận). Tranh: chỉ Gemini (nano-banana-2.1, LESSON_AI_GEMINI_KEY khi chữ dùng Claude).
    Không đổi đáp án/điểm/thứ tự; hoàn tác bằng "Hoàn tác cải thiện". Xem AI_SETUP.md.
  - Đã chạy thật 2026-10-10: Gemini chữ OK (tiết 3, 19 trang ~25 s). Tranh Gemini: 429 free tier limit 0
    → cần bật Billing. Claude: khoá hợp lệ nhưng tài khoản chưa có tín dụng (AI_BILLING).
  - Kiểm tra thật bằng runner: `{"action":"ai-smoke","args":{"image":true,"polish":"bai4-tiet3"}}`
    (claude-ai-smoke.mjs, in mã lỗi/nội dung lỗi của nhà cung cấp, không in khoá).
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
1. Người dùng nạp tín dụng Claude / bật Billing Gemini, chạy lại ai-smoke, thử nút AI trong app; rồi merge nhánh.
2. Có thể tự chụp ảnh slide bằng PowerPoint trên máy (COM, đã dò: PowerPoint 16 có sẵn) thay cho xuất PNG tay.
3. Module người dùng (sau): máy chủ giữ khoá, tài khoản, đếm lượt, thanh toán (VNPay/MoMo/PayOS); thay
   endpoint /api/lesson-ai/studio/* bằng máy chủ thật, phần trình duyệt giữ nguyên.
4. Trang câu hỏi còn trơn so với ảnh slide: cân nhắc dùng ảnh slide làm nền/tranh cho trang câu hỏi.
4. Nén video khi xuất (video gốc tiết 1 tới 25 MB); sao lưu (backup) chưa hỗ trợ video.
5. Trình phát trên điện thoại dọc (khung 16:9 thấp).
6. Việc cũ: gắn YCCĐ vào trang hoạt động, chọn YCCĐ theo tiết, xác nhận hàng loạt câu hỏi.
