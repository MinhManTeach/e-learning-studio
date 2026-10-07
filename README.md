# E-Learning Studio — Phase 1

Ứng dụng biên soạn bài giảng cho giáo viên bằng React, TypeScript và Vite. Schema hiện tại: **2.2**.

## Chạy tại máy

Yêu cầu Node.js 22.12+ hoặc 24 LTS và npm.

```powershell
npm install
npm run dev
npm test
npm run build
```

Mở địa chỉ Vite in ra, mặc định http://127.0.0.1:5173. Giữ tiến trình Vite khi sử dụng.

## Cách dùng

1. Chọn **Tạo bài giảng mới**, hoặc **Mở bài mẫu Phase 1** để khám phá bài 14 trang với tình huống và 10 câu hỏi. Mẫu cố ý có lớp chương trình 4 và lớp học sinh 5 để kiểm tra cảnh báo.
2. **Thông tin bài giảng** cho phép sửa metadata, mục tiêu, giao diện và điều kiện hoàn thành. Hai trường lớp độc lập; cảnh báo chỉ gợi ý, không sửa dữ liệu.
3. **Thêm trang** có tám loại: mở đầu, mục tiêu, nội dung, khởi động, tình huống, trắc nghiệm, tổng kết, hoàn thành. Chọn trang bên trái để sửa thuộc tính ở bên phải.
4. Mở **Bố cục & giai đoạn**, **Hình ảnh minh họa**, **Lời thuyết minh & ghi chú**, **Khả năng tiếp cận** khi cần. Chọn **Không dùng ảnh** để nội dung giãn hết chiều rộng. Ảnh HTTP(S) cần kết nối tới nguồn; ảnh không tải được có thông báo thay thế.
5. **Nhân bản**, **Lên**, **Xuống**, **Xóa** thao tác trên trang; xóa cần xác nhận. Cảnh báo mật độ không xóa hoặc viết lại nội dung.
6. Tự động lưu sau 900 ms ngừng nhập. Dùng **Lưu bài** hoặc Ctrl+S để lưu ngay, chờ **Đã lưu** trước khi đóng trang. Bài lưu trong IndexedDB của đúng trình duyệt và địa chỉ/port; localStorage là dự phòng. Xóa dữ liệu trình duyệt sẽ mất bài lưu.
7. **Xem trước** có điều hướng, tiến độ, giọng đọc, hoạt động, chấm quiz và hoàn thành. Phím ← → chuyển trang khi không tập trung vào điều khiển. **Bắt đầu lại xem trước** tạo phiên học mới; đáp án và tiến độ không lưu vào bài giảng. Giọng tiếng Việt tùy thiết bị.
8. **Xuất JSON** hiển thị dữ liệu bài đang sửa để sao chép, cùng nút tải tệp. **Mở tệp bài giảng** nhận JSON 2.2 và các bản cũ được hỗ trợ, tối đa 10 MB. Nếu ID đã tồn tại, ứng dụng hỏi trước khi thay thế, giữ nguyên ID/timestamps trong tệp. Hủy sẽ giữ bài hiện có.

## Kiến trúc

- `src/model`: Zod 2.2, các reader/migration cũ được đóng băng, cảnh báo và JSON.
- `src/slides`: registry duy nhất, factories và danh sách loại tương lai.
- `src/editor`: reducer bất biến và các bảng thuộc tính theo loại trang.
- `src/renderers`: renderer/layout dùng chung giữa editor và preview.
- `src/player`: phiên học độc lập, điểm có trọng số, tiến độ, điều kiện hoàn thành; giữ ranh giới `LmsAdapter`.
- `src/fixtures`, `examples/lesson-2.2.json`: bài mẫu phát triển.
- `src/storage`: IndexedDB/localStorage với validation khi đọc/ghi.
- `reference`: nguyên trạng tài liệu người dùng, không đưa vào runtime.

**The current edited canonical LessonProject is the single source of truth for export.** Export không chạy lại AI hoặc dựng lại bài từ tài liệu nguồn.

Không render HTML do giáo viên nhập. Không dùng backend, CDN/font mạng hoặc AI API. Media Library, thu âm, AI, SCORM/HTML5 ZIP và chứng nhận để các phase sau.

Xem `SCHEMA_2_2.md` và `PHASE_1_CHECKPOINT.md`. `SCHEMA_2_1.md` và `PHASE_0_CHECKPOINT.md` được giữ làm hồ sơ lịch sử.
