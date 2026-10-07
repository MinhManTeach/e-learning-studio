# Canonical LessonProject 2.2

`src/model/schema.ts` là hợp đồng Zod; kiểu TypeScript suy ra từ cùng schema. Project gồm identity/timestamps, metadata, objectives, settings, pedagogy, slides, assets và các nguồn migration tùy chọn.

## Tương thích

Chuỗi đọc: 1.x/2.0 → reader/migration 2.1 hiện có → 2.2. Reader 2.1 được đóng băng trong `schemaV21`, `factoriesV21`, `migrationsV21`; reader 2.0 phụ thuộc schema cũ. Dữ liệu 2.2 được validate trực tiếp, không hydrate identity thiếu.

Migration 2.1 → 2.2 không đổi projectId, timestamps, ID/thứ tự trang, metadata, mục tiêu, settings, assets cũ hoặc nguồn gốc. `grade` giữ lại; curriculumGrade và targetAudienceGrade ban đầu cùng lấy grade, sau đó sửa độc lập. Notes cũ thành teacherNotes; voiceScript giữ và đưa vào narration. Image URL cũ tạo asset reference với ID xác định từ slide ID, có giải quyết va chạm. Các payload legacy chưa có ánh xạ tin cậy vẫn giữ nguyên trong trang legacy và hiển thị thông báo tương thích.

Mẫu 2.1 thiếu identity vẫn dùng cơ chế hydrate của Phase 0. Tính xác định áp dụng cho phép chuyển một project 2.1 hợp lệ sang 2.2, không cho lần tạo identity mới của mẫu thiếu ID.

## Slide và layout

Discriminated union theo `type`: welcome, objectives, content, warmup, scenario, quiz, summary, completion, legacy. Payload đặc thù ở `data`; common fields đặt một lần. Registry duy nhất liên kết label, factory, editor, renderer, validator; loại tương lai chỉ được dự trữ.

Common fields gồm title/subtitle, pedagogicalStage, estimatedMinutes, layout, voiceScript, teacherNotes, narration, media, accessibility và thông tin bước cũ. Pedagogy STUDIO là mẫu của sản phẩm, không phải tuyên bố chuẩn bắt buộc của Bộ GDĐT.

Layouts: TEXT_ONLY, TEXT_LEFT_MEDIA_RIGHT, MEDIA_LEFT_TEXT_RIGHT, MEDIA_FULL, CENTERED. `effectiveLayout` hạ bố cục media xuống TEXT_ONLY khi media tắt/không có asset. CENTERED giữ căn giữa không ảnh. Cùng `SlideCanvas` và CSS sử dụng trong editor/preview; stage 16:9, nội dung dài cuộn bên trong. Mật độ có ngưỡng tập trung tại `densityThresholds` và chỉ cảnh báo.

## Assets, narration, accessibility

Slide media dùng assetId; assets giữ kind/sourceType/url/fileName/mimeType/size/altText/status. Chỉnh URL ảnh vẫn được hỗ trợ và cập nhật slide + asset trong một reducer action. Chỉnh ảnh của bản sao có asset dùng chung tạo reference riêng, tránh sửa ảnh trang gốc. Tắt ảnh giữ reference để giáo viên bật lại, nhưng renderer không đọc asset đó.

HTTP(S) là giao thức ảnh được phép, lỗi có fallback. Upload/library/generated/local/bundled là cấu trúc chuẩn bị, chưa có lưu blob hay đóng gói media. Narration NONE/BROWSER_TTS/AUDIO_ASSET; Phase 1 chỉ chạy Browser TTS, ưu tiên narration.text rồi voiceScript. Teacher notes không tới preview. Alt text, focus rõ, nhãn điều khiển, ký hiệu/chữ phản hồi, fontScale 1–2 và high contrast có sẵn. Captions/transcript/reducedMotion là trường chuẩn bị cho multimedia.

## Phiên học, quiz và hoàn thành

`LessonSessionState` riêng: currentSlideId, visitedSlideIds, interactions, quizAttempts. Không merge vào LessonProject hoặc storage/export. Preview restart tạo session mới. Tiến độ tính unique visited IDs hợp lệ / tổng trang, làm tròn để hiển thị.

Warmup phản hồi ngay, mặc định scored=false; chưa có đóng góp vào điểm tổng. Scenario 2–4 lựa chọn, ít nhất một recommended, có feedback/consequence; chỉ được thử lại nếu cả slide và lesson cho phép. Scenario không tính điểm quiz.

Quiz chấm theo earnedPoints / availablePoints × 100, làm tròn và giới hạn 0–100. Không trả lời tính 0; correct index sai không nhận điểm. Schema bắt index/IDs sai. Bộ chấm vẫn chịu được dữ liệu sai và bài rỗng/0 điểm không được tính đạt. PassingScore từng quiz dùng cho kết quả quiz; passingScore của lesson dùng cho tổng bài. Tổng hợp cộng điểm từ tất cả quiz, không trung bình phần trăm từng trang.

Retry chịu lesson.allowRetry và attemptsAllowed (null = không giới hạn); mỗi lượt lưu đáp án/kết quả riêng, lượt mới xóa draft. Shuffle xác định theo ID/lượt, đáp án chấm theo ID nên không phụ thuộc vị trí đang render. Review đúng/sai/đáp án/giải thích hiển thị khi allowReview và showFeedbackAfterSubmit cùng bật.

Completion IN_PROGRESS khi thiếu trang bắt buộc hoặc quiz bắt buộc. Khi các quiz đã nộp, PASSED/FAILED theo điểm tổng và ngưỡng lesson; nếu không bắt buộc quiz và chưa nộp đầy đủ, COMPLETED sau các điều kiện khác. Lesson requireQuiz=true nhưng không có quiz vẫn IN_PROGRESS. Chứng nhận chỉ là nút vô hiệu hóa.

## JSON và nguồn duy nhất

**The current edited canonical LessonProject is the single source of truth for export.** `exportProjectJSON` validate current project, serialize chính dữ liệu đó; không đọc legacySource/migrationSource để dựng lại bài, không chạy AI. Zod loại runtime/unknown keys ngoài hợp đồng. Import qua migration dispatch, lỗi schema hoặc JSON được thông báo tiếng Việt ở dashboard. ID trùng yêu cầu xác nhận thay thế; import không đổi identity để tạo bản sao ngầm.

Hộp xuất cung cấp văn bản JSON có thể sao chép và tải tệp. JSON chỉ chứa reference media, không chứa blob media. Tắt ảnh, sửa narration, thêm/xóa/sắp xếp trang và ghi chú của giáo viên được giữ qua round-trip.

LmsAdapter và StandaloneAdapter giữ nguyên. Không có SCORM mapping/runtime, ZIP, AI API, cloud hoặc chứng nhận mới.
