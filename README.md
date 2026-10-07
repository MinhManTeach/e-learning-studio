# E-Learning Studio — Phase 0

Ứng dụng biên soạn bài giảng cho giáo viên, chạy tại máy với React, TypeScript và Vite.

## Chạy ứng dụng

Yêu cầu Node.js 22.12+ hoặc 24 LTS và npm.

```powershell
cd "C:\Users\user\Documents\ChatGPT\App Elearning cho GV"
npm install
npm run dev
```

Mở địa chỉ Vite in ra, mặc định http://127.0.0.1:5173. Giữ cửa sổ chạy lệnh khi sử dụng ứng dụng.

```powershell
npm test
npm run build
npm run preview
```

## Cách dùng

1. Chọn **Tạo bài giảng mới**, nhập tên. Bài mới có trang mở đầu và trang nội dung.
2. Chọn **Thông tin bài giảng** để nhập môn, lớp, chủ đề, thời lượng, giáo viên, trường, chương trình và các mục tiêu.
3. Chọn trang bên trái; nhập nội dung và các ý chính ở bên phải. Mỗi dòng của các ý chính/mục tiêu tạo một mục riêng.
4. **Thêm trang**, **Nhân bản**, **Lên**, **Xuống**, **Xóa** thao tác trên trang; xóa cần xác nhận. Có thể xóa hết trang rồi thêm lại.
5. Dữ liệu tự động lưu sau 900 ms ngừng chỉnh sửa; trạng thái hiển thị ở trên. Dùng **Lưu bài** hoặc Ctrl+S để lưu ngay. Chờ **Đã lưu** trước khi đóng/tải lại trang. Nếu lỗi lưu, bài đang chỉnh sửa được giữ lại và có nút thử lại; đóng trang khi chưa lưu có cảnh báo trình duyệt.
6. **Xem trước** hiển thị renderer dùng chung, chuyển trang bằng nút hoặc phím mũi tên; **Về chỉnh sửa** quay lại trang đã chọn trong editor. Đọc bài dùng giọng tiếng Việt trên thiết bị, khả năng hoạt động offline tùy hệ điều hành/trình duyệt.
7. Sau khi tải lại, mở bài ở **Bài giảng của tôi**. Dữ liệu lưu trong IndexedDB của đúng trình duyệt và đúng địa chỉ/port, dự phòng localStorage nếu không mở được IndexedDB. Xóa dữ liệu trình duyệt sẽ xóa bài giảng. Phase 0 chưa có xuất bản/sao lưu tệp.
8. **Mở tệp bài giảng** nhận schema 2.0 hoặc bản tham chiếu 1.x, tối đa 10 MB. Luôn tạo bản độc lập, không ghi đè bài hiện có. Các hoạt động ngoài welcome/content được giữ nguyên dữ liệu nhưng chưa chạy tương tác trong preview.

## Cấu trúc

- `src/model`: schema Zod 2.0, kiểu suy ra, factories, migration dispatch.
- `src/editor`: reducer bất biến, Editor shell, danh sách và bảng thuộc tính.
- `src/renderers`: registry welcome/content/legacy, không phụ thuộc editor/LMS.
- `src/player`: preview và hợp đồng `LmsAdapter`, `StandaloneAdapter`; chưa triển khai SCORM runtime mới.
- `src/storage`: IndexedDB và localStorage theo cùng giao diện, kiểm tra dữ liệu lúc đọc/ghi.
- `tests`: Vitest và fake-indexeddb; dữ liệu, reducer, migration, lưu trữ.
- `reference`: bản sao nguyên trạng bốn tệp người dùng cung cấp; không nạp vào editor runtime.

Không sử dụng HTML không an toàn, CDN, font mạng hay dịch vụ backend. Hình ảnh chỉ nhận URL HTTP(S), có placeholder khi lỗi; ảnh mạng vẫn cần Internet. CSS và JS được Vite đóng gói tại máy, sẵn sàng cho player/export engine tương lai. Chưa có service worker hoặc trình xuất ZIP.

## Phạm vi

Phase 0 chỉ xây nền tảng và editor shell. Hoạt động tương tác, quiz builder, media library, SCORM/HTML ZIP, AI, tài khoản và cloud đều để các giai đoạn sau. Không tự động tiếp tục Phase 1.

Xem `REFERENCE_REVIEW.md` và `PHASE_0_CHECKPOINT.md` để biết kết quả kiểm tra và giới hạn.
