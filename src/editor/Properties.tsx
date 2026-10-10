import { SlidersHorizontal } from "lucide-react";
import type {
  LessonProject,
  Metadata,
  Objectives,
  Slide,
} from "../model/schema";
import { consistencyWarnings } from "../model/analysis";
import { Field, toLines } from "./Fields";
import { CheckField, NumberField, SelectField } from "./Controls";
import { SlideProperties } from "./SlideProperties";
export function Properties({
  project,
  slide,
  editMetadata,
  editObjectives,
  editSlide,
  editSettings,
  mediaChange,
}: {
  project: LessonProject;
  slide: Slide | undefined;
  editMetadata: (m: Metadata) => void;
  editObjectives: (o: Objectives) => void;
  editSlide: (s: Slide) => void;
  editSettings: (s: LessonProject["settings"]) => void;
  mediaChange: (url: string, alt: string) => void;
}) {
  const m = project.metadata,
    o = project.objectives,
    settings = project.settings;
  return (
    <aside className="properties">
      <div className="panel-heading">
        <SlidersHorizontal size={17} />
        <h2>{slide ? "Thuộc tính trang" : "Thông tin bài giảng"}</h2>
      </div>
      <div className="property-body">
        {slide ? (
          <SlideProperties
            slide={slide}
            project={project}
            edit={editSlide}
            mediaChange={mediaChange}
          />
        ) : (
          <>
            <div className="property-type">
              Thiết lập bài học · Phiên bản 2.2
            </div>
            {consistencyWarnings(project).map((w) => (
              <p className="callout" role="status" key={w.code}>
                {w.message}
              </p>
            ))}
            {(
              [
                ["projectTitle", "Tên bài giảng"],
                ["subject", "Môn"],
                ["curriculumGrade", "Lớp chương trình"],
                ["targetAudienceGrade", "Lớp học sinh"],
                ["topic", "Chủ đề"],
                ["teacherName", "Giáo viên"],
                ["schoolName", "Trường"],
                ["curriculum", "Chương trình"],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={m[key]}
                onChange={(v) => editMetadata({ ...m, [key]: v })}
              />
            ))}
            <NumberField
              label="Thời lượng (phút)"
              value={m.durationMinutes}
              onChange={(durationMinutes) =>
                editMetadata({
                  ...m,
                  durationMinutes: Math.floor(durationMinutes),
                })
              }
            />
            <details open>
              <summary>Mục tiêu bài học</summary>
              {(
                [
                  ["curriculumOutcomes", "Yêu cầu cần đạt"],
                  ["knowledge", "Kiến thức"],
                  ["competencies", "Năng lực"],
                  ["qualities", "Phẩm chất"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={o[key].join("\n")}
                  multiline
                  onChange={(v) => editObjectives({ ...o, [key]: toLines(v) })}
                />
              ))}
              {(
                [
                  ["code", "Mã tích hợp AI"],
                  ["title", "Tên nội dung tích hợp AI"],
                  ["description", "Mô tả tích hợp AI"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={o.aiIntegration[key]}
                  onChange={(v) =>
                    editObjectives({
                      ...o,
                      aiIntegration: { ...o.aiIntegration, [key]: v },
                    })
                  }
                  multiline={key === "description"}
                />
              ))}
              <Field
                label="Hỗ trợ học sinh có nhu cầu đặc biệt"
                value={o.specialNeeds}
                multiline
                onChange={(specialNeeds) =>
                  editObjectives({ ...o, specialNeeds })
                }
              />
              {o.digitalCompetencyIntegration.map((d, i) => (
                <details open key={i}>
                  <summary>Năng lực số {i + 1}</summary>
                  {(["code", "title", "description"] as const).map((key, j) => (
                    <Field
                      key={key}
                      label={
                        [
                          "Mã năng lực số",
                          "Tên năng lực số",
                          "Mô tả năng lực số",
                        ][j]
                      }
                      value={d[key]}
                      onChange={(v) =>
                        editObjectives({
                          ...o,
                          digitalCompetencyIntegration:
                            o.digitalCompetencyIntegration.map((x, k) =>
                              k === i ? { ...x, [key]: v } : x,
                            ),
                        })
                      }
                    />
                  ))}
                </details>
              ))}
              <button
                onClick={() =>
                  editObjectives({
                    ...o,
                    digitalCompetencyIntegration: [
                      ...o.digitalCompetencyIntegration,
                      { code: "", title: "", description: "" },
                    ],
                  })
                }
              >
                Thêm năng lực số
              </button>
            </details>
            <details open>
              <summary>Giao diện & hoàn thành bài</summary>
              <SelectField
                label="Chủ đề giao diện"
                value={settings.theme}
                options={{
                  SAFE_TEAL: "Xanh an toàn",
                  NAVY: "Xanh hải quân",
                  FOCUS_DARK: "Tập trung · Nền tối",
                  KIDS: "Vui nhộn (cho học sinh tiểu học)",
                }}
                onChange={(theme) => editSettings({ ...settings, theme })}
              />
              <NumberField
                label="Điểm đạt toàn bài (%)"
                value={settings.passingScore}
                max={100}
                onChange={(passingScore) =>
                  editSettings({ ...settings, passingScore })
                }
              />
              {(
                [
                  ["requireAllSlides", "Yêu cầu xem đủ trang"],
                  ["requireQuiz", "Yêu cầu hoàn tất trắc nghiệm"],
                  ["allowRetry", "Cho phép làm lại"],
                ] as const
              ).map(([key, label]) => (
                <CheckField
                  key={key}
                  label={label}
                  value={settings[key]}
                  onChange={(v) => editSettings({ ...settings, [key]: v })}
                />
              ))}
              <p className="hint">
                Các giai đoạn là mẫu sư phạm của E-Learning Studio, có thể điều
                chỉnh theo bài dạy.
              </p>
            </details>
          </>
        )}
      </div>
    </aside>
  );
}
