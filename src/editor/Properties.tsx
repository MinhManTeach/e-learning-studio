import { BookOpen, FileText, SlidersHorizontal } from "lucide-react";
import type { Metadata, Slide } from "../model/schema";
import { slideRegistry } from "../renderers/SlideCanvas";
import { Field, toLines } from "./Fields";
export function Properties({
  metadata,
  slide,
  editMetadata,
  editSlide,
}: {
  metadata: Metadata;
  slide: Slide | undefined;
  editMetadata: (metadata: Metadata) => void;
  editSlide: (slide: Slide) => void;
}) {
  return (
    <aside className="properties">
      <div className="panel-heading">
        <SlidersHorizontal size={17} />
        <h2>{slide ? "Thuộc tính trang" : "Thông tin bài giảng"}</h2>
      </div>
      <div className="property-body">
        {slide ? (
          <>
            <div className="property-type">
              <FileText size={17} />
              {slideRegistry[slide.type].label}
            </div>
            <Field
              label="Tiêu đề"
              value={slide.title}
              onChange={(title) => editSlide({ ...slide, title })}
            />
            <Field
              label="Tiêu đề phụ"
              value={slide.subtitle}
              onChange={(subtitle) => editSlide({ ...slide, subtitle })}
              multiline
              rows={2}
            />
            <details>
              <summary>Nhóm hoạt động</summary>
              <Field
                label="Tên hoạt động"
                value={slide.stepName}
                onChange={(stepName) => editSlide({ ...slide, stepName })}
              />
              <label className="field">
                <span>Bước số</span>
                <input
                  type="number"
                  min="0"
                  value={slide.stepNumber}
                  onChange={(e) =>
                    editSlide({
                      ...slide,
                      stepNumber: Math.max(
                        0,
                        Math.floor(Number(e.target.value)),
                      ),
                    })
                  }
                />
              </label>
            </details>
            {slide.type !== "legacy" ? (
              <>
                <Field
                  label="Nội dung"
                  value={slide.data.body}
                  onChange={(body) =>
                    editSlide({ ...slide, data: { ...slide.data, body } })
                  }
                  multiline
                  rows={5}
                />
                <Field
                  label="Các ý chính"
                  value={slide.data.bulletPoints.join("\n")}
                  onChange={(value) =>
                    editSlide({
                      ...slide,
                      data: { ...slide.data, bulletPoints: toLines(value) },
                    })
                  }
                  multiline
                  hint="Mỗi dòng là một ý."
                />
                <Field
                  label="Điểm cần nhớ"
                  value={slide.data.keyTakeaway}
                  onChange={(keyTakeaway) =>
                    editSlide({
                      ...slide,
                      data: { ...slide.data, keyTakeaway },
                    })
                  }
                  multiline
                  rows={2}
                />
                <details>
                  <summary>Hình ảnh minh họa</summary>
                  <Field
                    label="Đường dẫn hình ảnh"
                    value={slide.data.imageUrl}
                    onChange={(imageUrl) =>
                      editSlide({ ...slide, data: { ...slide.data, imageUrl } })
                    }
                    hint="Sử dụng đường dẫn https://. Ảnh mạng cần kết nối Internet."
                  />
                  <Field
                    label="Chú thích hình ảnh"
                    value={slide.data.imageCaption}
                    onChange={(imageCaption) =>
                      editSlide({
                        ...slide,
                        data: { ...slide.data, imageCaption },
                      })
                    }
                  />
                </details>
              </>
            ) : (
              <p className="callout">
                Dữ liệu hoạt động gốc được bảo toàn. Chỉnh sửa hoạt động sẽ có ở
                giai đoạn sau.
              </p>
            )}
            <details open>
              <summary>Lời thuyết minh & ghi chú</summary>
              <Field
                label="Lời thuyết minh"
                value={slide.voiceScript}
                onChange={(voiceScript) => editSlide({ ...slide, voiceScript })}
                multiline
              />
              <Field
                label="Ghi chú giáo viên"
                value={slide.notes}
                onChange={(notes) => editSlide({ ...slide, notes })}
                multiline
                hint="Ghi chú chỉ hiển thị khi soạn bài."
              />
            </details>
          </>
        ) : (
          <>
            <div className="property-type">
              <BookOpen size={17} /> Thiết lập bài học
            </div>
            {(
              [
                ["projectTitle", "Tên bài giảng"],
                ["subject", "Môn"],
                ["grade", "Lớp"],
                ["topic", "Chủ đề"],
                ["duration", "Thời lượng"],
                ["teacherName", "Giáo viên"],
                ["schoolName", "Trường"],
                ["curriculum", "Chương trình"],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={metadata[key]}
                onChange={(value) =>
                  editMetadata({ ...metadata, [key]: value })
                }
              />
            ))}
            <details open>
              <summary>Mục tiêu bài học</summary>
              {(
                [
                  ["knowledge", "Kiến thức"],
                  ["competencies", "Năng lực"],
                  ["qualities", "Phẩm chất"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={metadata.objectives[key].join("\n")}
                  multiline
                  hint="Mỗi dòng là một mục tiêu."
                  onChange={(value) =>
                    editMetadata({
                      ...metadata,
                      objectives: {
                        ...metadata.objectives,
                        [key]: toLines(value),
                      },
                    })
                  }
                />
              ))}
              <Field
                label="Tích hợp AI"
                value={metadata.aiIntegration}
                onChange={(aiIntegration) =>
                  editMetadata({ ...metadata, aiIntegration })
                }
                multiline
              />
              <Field
                label="Hỗ trợ học sinh có nhu cầu đặc biệt"
                value={metadata.specialNeeds}
                onChange={(specialNeeds) =>
                  editMetadata({ ...metadata, specialNeeds })
                }
                multiline
              />
            </details>
          </>
        )}
      </div>
    </aside>
  );
}
