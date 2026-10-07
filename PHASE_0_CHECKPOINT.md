# PHASE 0 CHECKPOINT

Ngày kiểm tra: 07/10/2026.

**BRANCH:** `feature/elearning-studio-phase-0`

**COMMIT:** Commit chứa checkpoint này. Xem mã chính xác bằng `git rev-parse HEAD` và trong báo cáo bàn giao ở chat.

**MESSAGE:** `feat: build Vietnamese e-learning studio phase 0 foundation`

**BUILD:** PASS — `npm run build` (strict TypeScript + Vite).

**TESTS:** 32/32 PASS — `npm test`, 2 tệp Vitest.

## IMPLEMENTED

- Dashboard Bài giảng của tôi: tạo, mở, danh sách gần đây, xác nhận xóa bài.
- Tự tạo trang mở đầu và trang nội dung khi tạo bài.
- Editor ba cột, giao diện giáo viên tiếng Việt, canvas 16:9.
- Metadata đầy đủ: tên, môn, lớp, chủ đề, thời lượng, giáo viên, trường, chương trình; mục tiêu kiến thức/năng lực/phẩm chất, tích hợp AI và hỗ trợ đặc biệt.
- Chọn/thêm/nhân bản/xóa có xác nhận/di chuyển lên xuống; chọn trang lân cận sau khi xóa; phục hồi bài không có trang bằng cách thêm trang mới.
- Sửa tiêu đề, tiêu đề phụ, nội dung, các ý chính, ghi nhớ, ảnh URL/chú thích, nhóm hoạt động, thuyết minh và ghi chú. Hiển thị thay đổi ngay trên canvas.
- Xem trước riêng: ẩn hai sidebar và thao tác trang, chuyển trang bằng nút/phím, đọc bài vi-VN, trở về chỉnh sửa. Thanh trên cho phép thoát preview; không thuộc nội dung player dùng chung.
- Lưu IndexedDB, dự phòng localStorage khi mở IndexedDB thất bại. Autosave có trạng thái, nút lưu, Ctrl+S, retry khi lỗi, cảnh báo rời trang khi chưa lưu. Không báo đã lưu khi thao tác ghi thất bại.
- Schema 2.0 có validation, version dispatch, adapter từ bản 1.x. Nhập tệp luôn tạo bản độc lập; hoạt động chưa hỗ trợ giữ payload gốc và hiển thị placeholder.
- Giữ nguyên bốn tệp tham chiếu, kiểm chứng SHA-256 trùng bản gốc.

## FILES CREATED

```text
.gitignore
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
README.md
REFERENCE_REVIEW.md
PHASE_0_CHECKPOINT.md
phase-0-editor.png
reference/index.html
reference/lesson_data.json
reference/scorm_api.js
reference/README_CHAY_OFFLINE.txt
src/main.tsx
src/App.tsx
src/Dashboard.tsx
src/styles.css
src/model/schema.ts
src/model/factories.ts
src/model/migrations.ts
src/editor/Editor.tsx
src/editor/reducer.ts
src/editor/SlideList.tsx
src/editor/Properties.tsx
src/editor/Fields.tsx
src/renderers/SlideCanvas.tsx
src/player/StudentPreview.tsx
src/player/lms.ts
src/storage/projects.ts
tests/model.test.ts
tests/storage.test.ts
```

## FILES MODIFIED

Không có tệp dự án cũ bị sửa. Workspace ban đầu chỉ có Git chưa có commit. Các tệp trong Downloads được đọc và sao chép, không thay đổi.

## ARCHITECTURE

React + strict TypeScript + Vite; Zod là nguồn schema/type. Reducer bất biến tách thao tác khỏi UI, chuẩn bị cho undo/redo tương lai. Dữ liệu chung và dữ liệu từng loại trang được tách bằng discriminated union.

Editor → schema 2.0 → shared renderer registry → student preview. Storage có giao diện chung với hai backend. `LmsAdapter` và `StandaloneAdapter` là ranh giới cho player tương lai; editor không nạp hoặc gọi SCORM. Bản SCORM gốc nằm nguyên trạng trong reference, chưa được tích hợp.

Mọi văn bản người dùng được React render như text, không dùng innerHTML. Ảnh chỉ nhận HTTP(S), lỗi ảnh hiển thị placeholder. App bundle không dùng runtime/font CDN; ảnh URL vẫn phụ thuộc mạng. Dữ liệu hỏng bị bỏ qua có thông báo, giữ bản gốc trong storage.

## MANUAL TEST

PASS — thực hiện qua trình duyệt cục bộ tại http://127.0.0.1:5173:

1. Mở app, tạo “Tin học lớp 4 – Thông tin trên Website”.
2. Nhập môn Tin học; lớp 4; chủ đề Thông tin trên Website; thời lượng 35 phút.
3. Sửa trang mở đầu: tên, tiêu đề phụ, nội dung và ghi nhớ.
4. Thêm ba Content; đổi tên thành Thông tin dạng văn bản, Thông tin dạng hình ảnh, Lướt web an toàn.
5. Đưa Lướt web an toàn lên trên trang hình ảnh.
6. Nhân bản trang; xác nhận hộp xóa xuất hiện; xóa bản sao; còn 5 trang, trang lân cận được chọn.
7. Lưu, tải lại trình duyệt, mở lại từ dashboard.
8. Xác minh metadata, nội dung trang mở đầu, nội dung trang văn bản và thứ tự được giữ nguyên.
9. Vào preview, chuyển qua cả 5 trang và quay lại trang trước; trở về chỉnh sửa.
10. Kiểm tra console: không có error/warn trong quy trình.
11. Kiểm tra 1366×768: canvas 768×432; 1920×1080: canvas 1225×689.0625. Đều 16:9; không tràn ngang toàn trang. Các panel cuộn độc lập.
12. Sau khi định dạng toàn bộ mã và Vite restart, tải lại và mở bài thành công, dữ liệu không mất.

Ảnh minh chứng: `phase-0-editor.png`. Bài kiểm thử được giữ trong trình duyệt dùng để xác minh, không tự tạo dữ liệu mẫu trong trình duyệt khác.

## KNOWN ISSUES / LIMITATIONS

- Build có hai cảnh báo chú thích PURE từ Zod; Rollup bỏ chú thích, build thành công. Không có lỗi TypeScript hoặc console ứng dụng.
- Lưu trữ thuộc trình duyệt/origin hiện tại, chưa có sao lưu/xuất tệp. Trình duyệt xóa dữ liệu sẽ mất bài. Không có giải quyết xung đột sửa cùng bài ở nhiều tab; nên dùng một tab soạn bài.
- Giọng đọc tùy thiết bị; chưa kiểm tra chất lượng phát âm thực tế hoặc hoạt động giọng offline.
- Ảnh mạng cần Internet. Chưa kiểm thử gói bài học offline vì exporter nằm ngoài Phase 0.
- Hoạt động warmup/scenario/quiz/hyperlink/mindmap/certificate nhập từ mẫu chỉ giữ dữ liệu và hiển thị thông báo hỗ trợ ở giai đoạn sau.
- Nội dung dài cuộn trong canvas; hệ thống bố cục/template và giới hạn nội dung sẽ được hoàn thiện ở Phase 1.

## DEFERRED

AI, media library, quiz builder, tương tác học tập, xuất SCORM/HTML ZIP, SCORM 2004, xAPI, cloud, authentication, collaboration, analytics, thanh toán, chứng nhận, LMS upload; không triển khai trong Phase 0.

## NEXT RECOMMENDED PHASE

**Phase 1 — Core Slide & Template System.** Dừng tại checkpoint này, chờ yêu cầu tiếp theo.

## LOCAL COMMAND

```powershell
cd "C:\Users\user\Documents\ChatGPT\App Elearning cho GV"
npm install
npm run dev
```

Mở địa chỉ Vite hiển thị (mặc định http://127.0.0.1:5173). Chưa push lên remote.
