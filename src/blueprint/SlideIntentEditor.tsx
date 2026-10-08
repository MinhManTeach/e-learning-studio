import { stages } from "../model/schema";
import { stageLabels } from "../model/analysis";
import {
  interactionTypes,
  mediaTypes,
  outcomeCatalog,
  slideTypeLabels,
  slideTypes,
  type BlueprintSlide,
} from "./model";
import type { PedagogicalAnalysis } from "../import/model";

export function SlideIntentEditor({
  slide: s,
  analysis,
  edit,
  done,
}: {
  slide: BlueprintSlide;
  analysis: PedagogicalAnalysis;
  edit: (patch: Partial<BlueprintSlide>) => void;
  done: () => void;
}) {
  const m = s.mediaIntent ?? { type: "NONE", purpose: "", required: false };
  const interaction = s.interactionIntent ?? { type: "NONE", description: "" };
  function changeType(type: BlueprintSlide["type"]) {
    edit({
      type,
      interactionIntent:
        type === "QUIZ"
          ? {
              type: "MULTIPLE_CHOICE",
              description: "Đánh giá mức đạt mục tiêu học tập",
            }
          : type === "SCENARIO"
            ? {
                type: "SCENARIO",
                description: "Chọn cách xử lý và giải thích lý do",
              }
            : interaction,
    });
  }
  return (
    <div className="blueprint-form" aria-label={`Chỉnh sửa trang ${s.order}`}>
      <label>
        Tiêu đề trang
        <input
          value={s.title}
          onChange={(e) => edit({ title: e.target.value })}
        />
      </label>
      <label>
        Mục đích sư phạm
        <textarea
          value={s.pedagogicalPurpose}
          onChange={(e) => edit({ pedagogicalPurpose: e.target.value })}
        />
      </label>
      <label>
        Đề cương nội dung · mỗi dòng một ý
        <textarea
          rows={4}
          disabled={!!s.sourceAssessmentIds?.length}
          value={s.contentOutline.join("\n")}
          onChange={(e) => edit({ contentOutline: e.target.value.split("\n") })}
        />
      </label>
      {!!s.sourceAssessmentIds?.length && (
        <p>
          Câu hỏi và đáp án được giữ theo bản đã duyệt. Sửa tại bước giáo viên
          kiểm tra câu hỏi trước khi tạo lại kịch bản.
        </p>
      )}
      <div className="blueprint-fields">
        <label>
          Loại trang
          <select
            value={s.type}
            onChange={(e) =>
              changeType(e.target.value as BlueprintSlide["type"])
            }
          >
            {slideTypes.map((t) => (
              <option key={t} value={t}>
                {slideTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Giai đoạn
          <select
            value={s.stage}
            onChange={(e) =>
              edit({ stage: e.target.value as BlueprintSlide["stage"] })
            }
          >
            {stages.map((t) => (
              <option key={t} value={t}>
                {stageLabels[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thời gian (phút)
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={s.estimatedMinutes}
            onChange={(e) => edit({ estimatedMinutes: Number(e.target.value) })}
          />
        </label>
      </div>
      <fieldset>
        <legend>Học liệu dự kiến</legend>
        <label>
          Loại học liệu
          <select
            value={m.type}
            onChange={(e) =>
              edit({
                mediaIntent: {
                  ...m,
                  type: e.target.value as typeof m.type,
                  required: e.target.value === "NONE" ? false : m.required,
                },
              })
            }
          >
            {mediaTypes.map((t) => (
              <option key={t} value={t}>
                {
                  {
                    NONE: "Không cần",
                    IMAGE: "Ảnh",
                    VIDEO: "Video",
                    AUDIO: "Âm thanh",
                    ILLUSTRATION: "Minh họa",
                  }[t]
                }
              </option>
            ))}
          </select>
        </label>
        {m.type !== "NONE" && (
          <>
            <label>
              Mục đích học liệu
              <input
                value={m.purpose}
                onChange={(e) =>
                  edit({ mediaIntent: { ...m, purpose: e.target.value } })
                }
              />
            </label>
            <label>
              Từ khóa tìm kiếm
              <input
                value={m.searchQuery ?? ""}
                onChange={(e) =>
                  edit({ mediaIntent: { ...m, searchQuery: e.target.value } })
                }
              />
            </label>
            <label>
              Mô tả hình minh họa
              <textarea
                value={m.visualDescription ?? ""}
                onChange={(e) =>
                  edit({
                    mediaIntent: { ...m, visualDescription: e.target.value },
                  })
                }
              />
            </label>
            <label className="blueprint-check">
              <input
                type="checkbox"
                checked={m.required}
                onChange={(e) =>
                  edit({ mediaIntent: { ...m, required: e.target.checked } })
                }
              />
              Cần học liệu này
            </label>
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>Tương tác dự kiến</legend>
        <label>
          Loại tương tác
          <select
            value={interaction.type}
            onChange={(e) =>
              edit({
                interactionIntent: {
                  ...interaction,
                  type: e.target.value as typeof interaction.type,
                },
              })
            }
          >
            {interactionTypes
              .filter((t) =>
                s.type === "QUIZ"
                  ? [
                      "MULTIPLE_CHOICE",
                      "TRUE_FALSE",
                      "SHORT_PRACTICE",
                    ].includes(t)
                  : s.type === "SCENARIO"
                    ? t === "SCENARIO"
                    : true,
              )
              .map((t) => (
                <option key={t} value={t}>
                  {
                    {
                      NONE: "Không có",
                      MULTIPLE_CHOICE: "Chọn đáp án",
                      TRUE_FALSE: "Đúng / Sai",
                      SCENARIO: "Ra quyết định",
                      SHORT_PRACTICE: "Thực hành ngắn",
                    }[t]
                  }
                </option>
              ))}
          </select>
        </label>
        {interaction.type !== "NONE" && (
          <label>
            Mô tả tương tác
            <textarea
              value={interaction.description}
              onChange={(e) =>
                edit({
                  interactionIntent: {
                    ...interaction,
                    description: e.target.value,
                  },
                })
              }
            />
          </label>
        )}
      </fieldset>
      <fieldset>
        <legend>Yêu cầu cần đạt được thể hiện</legend>
        {outcomeCatalog(analysis).map((o) => (
          <label className="blueprint-check" key={o.id}>
            <input
              type="checkbox"
              checked={s.sourceOutcomeIds.includes(o.id)}
              onChange={(e) =>
                edit({
                  sourceOutcomeIds: e.target.checked
                    ? [...s.sourceOutcomeIds, o.id]
                    : s.sourceOutcomeIds.filter((id) => id !== o.id),
                })
              }
            />
            {o.text}
          </label>
        ))}
      </fieldset>
      <button className="primary" onClick={done}>
        Xong
      </button>
    </div>
  );
}
