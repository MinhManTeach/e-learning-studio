# Bàn giao giữa các phiên Claude (cập nhật 2026-10-10)

## Trạng thái nhánh
- `main` có: 6 sửa lỗi Bài 4, xuất SCORM 1.2 + HTML5, mục lục trái, giấy chứng nhận, nhập PowerPoint.
- Nhánh `claude/import-cleanup-ai` (chưa merge, CI xanh trên máy người dùng; máy đang ở nhánh này):
  - Nhập PowerPoint sạch hơn: bỏ panel/khung/hình phẳng (bytes/pixel từ header ảnh), nối dòng bị cắt,
    đọc theo hàng, bỏ nhãn lặp, slide chỉ có tranh → trang phủ kín + nhắc "Đặt tên trang".
  - Trang mới: `cards` (STEPS/COMPARE/TIMELINE/MINDMAP/FLIP) và `activity` (ORDER/SORT/MATCH, bấm hoặc kéo,
    Kiểm tra/Làm lại, không tính điểm). src/renderers/CardsRenderer.tsx, ActivityRenderer.tsx, player/activity.ts.
  - "AI thiết kế bài giảng" (src/ai/design.ts, request.ts, AiStudio.tsx; server/studio.ts designLesson,
    gemini.ts, anthropic.ts): MỘT lần gọi cho cả bài → mẫu trang cho trang kiến thức + 3–6 hoạt động
    (sắp xếp, phân loại, nối, Đúng/Sai, trắc nghiệm, tình huống) chèn sau trang liên quan + sửa tiêu đề.
    Giáo viên chọn; không xoá trang, không đổi đáp án; hoàn tác bằng "Hoàn tác cải thiện". Xem AI_SETUP.md.
    Bản "AI làm đẹp" (chỉ viết lại chữ) đã bị bỏ vì người dùng thấy không đáng trả tiền.
  - Chạy thật (Claude sonnet-5-5) trên tiết 2: 10 trang thiết kế lại, 6 hoạt động, ~76 s. Gói xem thử đã gửi.
  - Đã chạy thật 2026-10-10: Gemini chữ OK (tiết 3, 19 trang ~25 s). Tranh Gemini: 429 free tier limit 0
    → cần bật Billing. Claude (sonnet-5-5) chạy thật OK sau khi nạp tín dụng: tiết 3, 19 trang ~41 s, giữ sát lời giáo viên.
  - Người dùng muốn: hạn chế gọi API cho phần chữ (một lần/bài khi bấm nút, không gọi tự động);
    KHÔNG tạo video bằng AI, chỉ dùng video có sẵn trong PowerPoint.
  - Kiểm tra thật bằng runner: `{"action":"ai-smoke","args":{"image":true,"polish":"bai4-tiet3"}}`
    (claude-ai-smoke.mjs, in mã lỗi/nội dung lỗi của nhà cung cấp, không in khoá).
- Gói SCORM đã chạy thật trên LMS360.vn của trường (người dùng xác nhận 2026-10-10).
- Codex không còn review. Quy tắc: mọi thay đổi có test, mỗi lỗi một commit. Người dùng cho phép merge vào main khi CI xanh.

## Giao diện "Vui nhộn" (theme KIDS, 2026-10-10)
- src/kids-theme.css: mỗi chặng một màu (data-stage trên .canvas và .lesson-player), font Baloo 2 + Nunito
  (src/assets/fonts, OFL, chỉ subset latin + vietnamese; player.css nhúng base64 qua assetsInlineLimit).
- Bài mới mặc định KIDS (createProject); bài cũ giữ theme đã lưu. Khen "Giỏi quá!" + pháo giấy + chuông
  (src/player/celebrate.ts, Celebration.tsx; tắt bằng nút Âm thanh). Người dùng đã duyệt giao diện.
- Font lấy bằng runner action `font-pack` (npm pack @fontsource/*), vì máy cloud không vào được npm.

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
1. Người dùng thử nút "AI thiết kế bài giảng" trong app (nhập lại PowerPoint trước); ổn thì merge nhánh.
2. Có thể tự chụp ảnh slide bằng PowerPoint trên máy (COM, đã dò: PowerPoint 16 có sẵn) thay cho xuất PNG tay.
3. Module người dùng (sau): máy chủ giữ khoá, tài khoản, đếm lượt, thanh toán (VNPay/MoMo/PayOS); thay
   endpoint /api/lesson-ai/studio/* bằng máy chủ thật, phần trình duyệt giữ nguyên.
4. Trang câu hỏi còn trơn so với ảnh slide: cân nhắc dùng ảnh slide làm nền/tranh cho trang câu hỏi.
4. Nén video khi xuất (video gốc tiết 1 tới 25 MB); sao lưu (backup) chưa hỗ trợ video.
5. Trình phát trên điện thoại dọc (khung 16:9 thấp).
6. Việc cũ: gắn YCCĐ vào trang hoạt động, chọn YCCĐ theo tiết, xác nhận hàng loạt câu hỏi.
