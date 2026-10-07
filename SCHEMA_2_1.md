# Schema 2.1 — cập nhật nền tảng Phase 0

## Thay đổi

- `schemaVersion`: `2.1` cho bài mới và bài được lưu lại.
- Metadata giữ tên bài, môn, lớp, chủ đề, giáo viên, trường và chương trình. Thời lượng đổi thành `durationMinutes`, số nguyên không âm, mặc định 35 cho bài mới.
- `objectives` chuyển lên cấp gốc, gồm knowledge/competencies/qualities, aiIntegration và specialNeeds.
- `aiIntegration` là object `{ code, title, description }`. Giao diện có ba ô tiếng Việt tương ứng.
- Settings: `aspectRatio: "16:9"`, `theme: "SAFE_TEAL"`, passingScore 0–100; requireAllSlides, requireQuiz và allowRetry là boolean. Mặc định theo mẫu người dùng: 80 và ba cờ true.
- Ba cờ chỉ được lưu dữ liệu, chưa thực thi trong player Phase 0. Không bổ sung quiz builder hoặc chức năng xuất bài.

## Migration và an toàn dữ liệu

- Bài 2.0 được kiểm tra bằng reader riêng rồi chuyển sang 2.1 khi đọc từ IndexedDB, localStorage hoặc nhập tệp.
- Giữ nguyên projectId, createdAt, updatedAt, tiêu đề, slide IDs/thứ tự/nội dung, assets, legacySource và điểm đạt. Chuyển theme studio thành SAFE_TEAL.
- Nội dung AI dạng chuỗi cũ đưa vào description, code/title để trống. Không tự suy diễn mã chuẩn từ văn bản tự do.
- Thời lượng như `35 phút (1 tiết học)` chuyển thành 35. Chuỗi không nhận diện được chuyển thành 0; dữ liệu nguyên gốc nằm trong `migrationSource`, có thể truy hồi. Nguồn 1.x vẫn được giữ trong legacySource.
- Mở bài không tự ghi đè dữ liệu lưu trữ. Khi lưu/chỉnh sửa, phiên bản 2.1 mới được ghi cùng bản nguồn để đối chiếu.
- Tệp mẫu 2.1 có thể thiếu projectId/timestamps/projectTitle; import bổ sung các trường này, dùng topic làm tên mặc định. ID rỗng hoặc giá trị ngày không hợp lệ vẫn bị từ chối. Reader storage bắt buộc có ID, tránh tái sinh ID cho bản ghi hỏng.
- Nhập mẫu `slides: []` giữ nguyên bài trống. Tạo bài mới từ dashboard vẫn có hai trang khởi đầu.
- Bản 1.x chuyển thẳng sang 2.1; payload hoạt động chưa hỗ trợ vẫn được giữ nguyên.

## Kiểm chứng

- `npm run build`: PASS.
- `npm test`: **51/51 PASS**. Thêm 19 trường hợp: mẫu người dùng, cấp ID, migration 2.0, bảo toàn payload/identity/thời gian, duration và settings không hợp lệ, cờ false, hai backend lưu trữ thật qua fake-indexeddb/localStorage giả lập.
- Trình duyệt: tải lại và mở bài 2.0 từ Phase 0, xác nhận đủ 5 trang theo đúng thứ tự, durationMinutes=35; lưu lại thành công.
- Nhập `examples/lesson-2.1.json` qua hộp chọn tệp: tên lấy từ topic, 35 phút, đúng mục tiêu/AI/hỗ trợ đặc biệt, 0 trang.
- Sửa ô mã AI, lưu, tải lại, mở lại: mục tiêu và các trường tích hợp AI còn nguyên. Console không có error/warn trong phiên kiểm chứng.
- Minh chứng giao diện: `schema-2.1-editor.png`.

Checkpoint Phase 0 ban đầu trong `PHASE_0_CHECKPOINT.md` được giữ như báo cáo lịch sử schema 2.0. Bản cập nhật này không bắt đầu Phase 1.
