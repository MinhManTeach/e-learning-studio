import type { LessonProject, Slide } from "../model/schema";
import { layouts, stages } from "../model/schema";
import {
  analyzeSlideDensity,
  layoutLabels,
  stageLabels,
} from "../model/analysis";
import { slideRegistry } from "../slides/registry";
import { Field } from "./Fields";
import { CheckField, NumberField, SelectField } from "./Controls";
export function SlideProperties({
  slide: s,
  project,
  edit,
  mediaChange,
}: {
  slide: Slide;
  project: LessonProject;
  edit: (s: Slide) => void;
  mediaChange: (url: string, altText: string) => void;
}) {
  const Entry = slideRegistry[s.type];
  const asset = project.assets.find((a) => a.id === s.media.assetId);
  const warnings = analyzeSlideDensity(s);
  return (
    <>
      <div className="property-type">{Entry.label}</div>
      {s.media.suggestion && !asset?.url && (
        <p className="callout" role="status">
          Cần học liệu minh họa · Mở “Hình ảnh minh họa” để xem gợi ý và bổ
          sung.
        </p>
      )}
      <Field
        label="Tiêu đề"
        value={s.title}
        onChange={(title) => edit({ ...s, title })}
      />
      <Field
        label="Tiêu đề phụ"
        value={s.subtitle}
        multiline
        rows={2}
        onChange={(subtitle) => edit({ ...s, subtitle })}
      />
      {warnings.length > 0 && (
        <div className="callout" role="status">
          {warnings.map((w) => (
            <p key={w.code}>{w.message}</p>
          ))}
        </div>
      )}
      <details>
        <summary>Bố cục & giai đoạn</summary>
        <SelectField
          label="Giai đoạn sư phạm"
          // Unset stays visibly unset; the canvas then shows the step name.
          value={s.pedagogicalStage ?? ""}
          options={{
            "": "Chưa chọn giai đoạn",
            ...(Object.fromEntries(
              stages.map((x) => [x, stageLabels[x]]),
            ) as typeof stageLabels),
          }}
          onChange={(stage) =>
            edit({ ...s, pedagogicalStage: stage || undefined })
          }
        />
        <NumberField
          label="Thời lượng dự kiến (phút)"
          value={s.estimatedMinutes ?? 0}
          onChange={(estimatedMinutes) => edit({ ...s, estimatedMinutes })}
        />
        <SelectField
          label="Bố cục"
          value={s.layout}
          options={
            Object.fromEntries(
              layouts.map((x) => [x, layoutLabels[x]]),
            ) as typeof layoutLabels
          }
          onChange={(layout) => edit({ ...s, layout })}
        />
      </details>
      <details open>
        <summary>Nội dung trang</summary>
        <Entry.Editor slide={s} edit={edit} />
      </details>
      <details>
        <summary>Hình ảnh minh họa</summary>
        <CheckField
          label="Không dùng ảnh"
          value={!s.media.enabled}
          onChange={(disabled) =>
            edit({ ...s, media: { ...s.media, enabled: !disabled } })
          }
        />
        {asset?.status === "LOCAL" ? (
          <p className="callout">
            Ảnh đã lưu trên thiết bị. Dùng “Bổ sung hình ảnh cho bài giảng” để
            thay ảnh.
          </p>
        ) : (
          <Field
            label="Đường dẫn hình ảnh"
            value={asset?.url ?? ""}
            onChange={(url) => mediaChange(url, asset?.altText ?? "")}
            hint="Ảnh mạng cần kết nối Internet."
          />
        )}
        <Field
          label="Mô tả ảnh cho người nghe"
          value={asset?.altText ?? ""}
          onChange={(alt) => mediaChange(asset?.url ?? "", alt)}
        />
        <Field
          label="Chú thích hình ảnh"
          value={s.media.caption}
          onChange={(caption) => edit({ ...s, media: { ...s.media, caption } })}
        />
        <Field
          label="Gợi ý hình minh họa"
          value={s.media.suggestion}
          onChange={(suggestion) =>
            edit({ ...s, media: { ...s.media, suggestion } })
          }
        />
      </details>
      <details>
        <summary>Lời thuyết minh & ghi chú</summary>
        <CheckField
          label="Bật đọc bài bằng trình duyệt"
          value={s.narration.mode === "BROWSER_TTS"}
          onChange={(enabled) =>
            edit({
              ...s,
              narration: {
                ...s.narration,
                mode: enabled ? "BROWSER_TTS" : "NONE",
              },
            })
          }
        />
        <Field
          label="Lời thuyết minh"
          value={s.voiceScript}
          multiline
          onChange={(voiceScript) =>
            edit({
              ...s,
              voiceScript,
              narration: { ...s.narration, text: voiceScript },
            })
          }
        />
        <Field
          label="Ghi chú giáo viên"
          value={s.teacherNotes}
          multiline
          onChange={(teacherNotes) => edit({ ...s, teacherNotes })}
        />
      </details>
      <details>
        <summary>Khả năng tiếp cận</summary>
        <NumberField
          label="Tỷ lệ cỡ chữ"
          value={s.accessibility.fontScale}
          min={1}
          max={2}
          step={0.1}
          onChange={(fontScale) =>
            edit({ ...s, accessibility: { ...s.accessibility, fontScale } })
          }
        />
        <CheckField
          label="Tương phản cao"
          value={s.accessibility.highContrast}
          onChange={(highContrast) =>
            edit({ ...s, accessibility: { ...s.accessibility, highContrast } })
          }
        />
        <Field
          label="Bản chép lời"
          value={s.accessibility.transcript}
          multiline
          onChange={(transcript) =>
            edit({ ...s, accessibility: { ...s.accessibility, transcript } })
          }
        />
      </details>
    </>
  );
}
