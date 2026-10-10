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

## SCORM 2004, giọng đọc, đo token (nhánh `claude/scorm-2004`, 2026-10-10, chờ người dùng duyệt)
- LMS360 nhận cả SCORM 1.2 và 2004. Nút xuất có ô "Chuẩn" (nhớ trong localStorage); gói 2004 tên `*-scorm2004.zip`,
  manifest 2004 4th Ed (completionSetByContent/objectiveSetByContent). Một trình phát chạy cả hai:
  connectLms tìm API_1484_11 trước, rồi API (src/player/lms.ts Scorm2004Adapter). Đã chạy gói thật với LMS giả.
- Giọng đọc: src/player/speech.ts (một bộ đọc chung, chỉ giọng vi, ưu tiên Natural/Online, cắt đoạn ≤180 ký tự,
  không regex lookbehind vì iPad cũ), readAloud.ts (pageSpeech: lời thuyết minh, nếu không có thì đọc chữ trên trang),
  SpeakButton.tsx (nút loa cạnh câu hỏi, yêu cầu hoạt động, tình huống, khởi động, "Em cần nhớ"; ẩn khi trang tắt đọc
  hoặc trình duyệt không đọc được). Máy không có giọng vi → thông báo, không đọc bằng giọng Anh.
- Đo chi phí: server/usage.ts; designLesson in một dòng "[AI thiết kế bài giảng] model: N token vào, M token ra, s giây"
  ra cửa sổ chạy app (không in nội dung bài). Kế hoạch bản web trả phí: docs/KE_HOACH_BAN_WEB.md (chờ quyết định).
- Runner: export-lesson nhận `"scorm":"2004"`.
- Chrome/Brave/Cốc Cốc trên Windows chỉ thấy giọng SAPI (David, Zira); giọng Việt "Microsoft An" của gói ngôn ngữ
  nằm ở OneCore, chỉ Edge dùng được. Đã kiểm tra trên máy người dùng (runner `voice-probe`).
- Vì vậy có "Tạo giọng đọc" (nhánh `claude/voice-clips`): server/windowsVoice.ts dùng WinRT SpeechSynthesizer +
  MediaTranscoder (PowerShell -EncodedCommand, chữ đi qua in.json UTF-8) → M4A 16 kHz mono 32 kbps. Endpoint
  /api/lesson-ai/voice/status|record. src/voice/: voiceover.ts (thu phần còn thiếu, lô 40), VoiceDialog.tsx,
  useRecordedVoice.ts (xem trước). Tệp lưu trong kho media IndexedDB, assetId `voice-<voiceKey>`; voiceKey = băm
  ngôn ngữ + chữ đã chuẩn hoá (readAloud.ts). Gói SCORM: voice/0001.m4a…, lesson-data.js `voice: {key: path}`;
  speech.ts phát bản thu khi đủ mọi mảnh, nếu thiếu thì dùng giọng trình duyệt. Câu trắc nghiệm đọc theo mảnh
  (số câu, câu hỏi, từng đáp án) để khớp thứ tự khi xáo đáp án.
- Thử thật tiết 2: 87 đoạn thu trong 12 giây, gói tăng ~2 MB. Runner: export-lesson `"voice": true`.
- Chromium của Playwright không giải mã AAC (Chrome/Edge/Brave thật thì có), nên kiểm tra phát trên máy thật.

## Đáp án câu hỏi (nhánh `claude/quiz-answers`, 2026-10-10, chờ người dùng thử)
- src/model/answers.ts: `correctAnswerIndexes` (nhiều đáp án đúng, học sinh phải tích đủ), `answerUnknown`
  (PowerPoint không cho biết đáp án → trình soạn báo đỏ, exportIssues BLOCK). Câu trả lời lưu là một chuỗi
  id nối bằng dấu phẩy, nên resume/suspend_data giữ nguyên dạng.
- AI thiết kế: request gửi `correct: number[]` ([] = chưa rõ); plan có `answers` (gợi ý, mặc định KHÔNG tích,
  chỉ cho câu answerUnknown); không thêm lời giải thích cho đáp án chưa xác nhận. Prompt v2 chống lặp ý.
- Model mặc định claude-haiku-5-5 (~0,01 USD/bài; Opus ~0,15 USD/bài 28 trang, chất lượng tương đương).

## Bản web có đăng nhập và thanh toán (nhánh `claude/web-accounts`, 2026-10-10)
- server/web/: store.ts (node:sqlite: users, sessions băm, credit_ledger chỉ thêm dòng, unique(reason,ref),
  ai_calls, payments), google.ts (OIDC + PKCE, kiểm chữ ký RS256 bằng JWKS), payos.ts (ký như @payos/node;
  webhook kiểm checksum, cộng lượt đúng một lần, đúng số tiền), app.ts (createWebHandler: /auth/google,
  /api/me, /api/lesson-ai/studio/*, /api/plans, /api/pay/create, /api/pay/webhook, phục vụ dist + SPA), main.ts.
- Trừ lượt chỉ khi AI trả kết quả; một yêu cầu AI/người; POST phải cùng origin (trừ webhook).
- Client: src/account/ (AccountBar, BuyCredits, readAccount: /api/me trả HTML → chế độ máy cá nhân).
- Gói: TEACHER_MONTH 49k/50 lượt, TEACHER_YEAR 399k/600 lượt; FREE_CREDITS=10 khi đăng ký.
- Runner: build-server, web-server (cổng 8080, đọc LESSON_AI_/GOOGLE_/PAYOS_ từ .env.local, restart:true).
- Hướng dẫn lấy khoá và triển khai: docs/TRIEN_KHAI.md. Chưa có: giọng đọc trên web, Zalo, vẽ tranh.

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
3. Module người dùng: xem docs/KE_HOACH_BAN_WEB.md (chờ người dùng quyết ngân sách, tên miền, pháp nhân, giá).
4. Trang câu hỏi còn trơn so với ảnh slide: cân nhắc dùng ảnh slide làm nền/tranh cho trang câu hỏi.
4. Nén video khi xuất (video gốc tiết 1 tới 25 MB); sao lưu (backup) chưa hỗ trợ video.
5. Trình phát trên điện thoại dọc (khung 16:9 thấp).
6. Việc cũ: gắn YCCĐ vào trang hoạt động, chọn YCCĐ theo tiết, xác nhận hàng loạt câu hỏi.
