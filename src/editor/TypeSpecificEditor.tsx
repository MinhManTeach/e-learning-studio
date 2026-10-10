import type { Slide } from "../model/schema";
import { Field, toLines } from "./Fields";
import { CheckField } from "./Controls";
import { QuizEditor } from "./QuizEditor";
import { defaultChoice } from "../slides/defaults";
import { ActivityEditor, CardsEditor } from "./CardsActivityEditor";
export interface TypeEditorProps {
  slide: Slide;
  edit: (slide: Slide) => void;
}
export function TypeSpecificEditor({ slide: s, edit }: TypeEditorProps) {
  if (s.type === "cards") return <CardsEditor slide={s} edit={edit} />;
  if (s.type === "activity") return <ActivityEditor slide={s} edit={edit} />;
  if (s.type === "content" || s.type === "welcome")
    return (
      <>
        <Field
          label="Nội dung"
          value={s.data.body}
          multiline
          rows={4}
          onChange={(body) => edit({ ...s, data: { ...s.data, body } })}
        />
        <Field
          label="Đoạn văn (mỗi dòng một đoạn)"
          value={s.data.paragraphs.join("\n")}
          multiline
          onChange={(v) =>
            edit({ ...s, data: { ...s.data, paragraphs: toLines(v) } })
          }
        />
        <Field
          label="Các ý chính"
          value={s.data.bulletPoints.join("\n")}
          multiline
          onChange={(v) =>
            edit({ ...s, data: { ...s.data, bulletPoints: toLines(v) } })
          }
        />
        <Field
          label="Từ khóa (mỗi dòng một từ)"
          value={s.data.keywords.join("\n")}
          multiline
          onChange={(v) =>
            edit({ ...s, data: { ...s.data, keywords: toLines(v) } })
          }
        />
        <Field
          label="Điểm cần nhớ"
          value={s.data.keyTakeaway}
          multiline
          onChange={(keyTakeaway) =>
            edit({ ...s, data: { ...s.data, keyTakeaway } })
          }
        />
      </>
    );
  if (s.type === "objectives")
    return (
      <>
        {(
          [
            ["learningOutcomes", "Sau bài học, em làm được"],
            ["keyMessages", "Thông điệp chính"],
            ["icons", "Biểu tượng cho từng mục tiêu"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={s.data[key].join("\n")}
            multiline
            onChange={(v) =>
              edit({ ...s, data: { ...s.data, [key]: toLines(v) } })
            }
          />
        ))}
        <p className="hint">
          Nội dung hiển thị độc lập với mục tiêu chương trình của bài giảng.
        </p>
      </>
    );
  if (s.type === "warmup")
    return (
      <>
        <Field
          label="Câu hỏi khởi động"
          value={s.data.question}
          onChange={(question) => edit({ ...s, data: { ...s.data, question } })}
          multiline
        />
        <Field
          label="Hướng dẫn"
          value={s.data.instruction}
          onChange={(instruction) =>
            edit({ ...s, data: { ...s.data, instruction } })
          }
        />
        {s.data.items.map((item, i) => {
          const update = (patch: Partial<typeof item>) =>
            edit({
              ...s,
              data: {
                ...s.data,
                items: s.data.items.map((x) =>
                  x.id === item.id ? { ...x, ...patch } : x,
                ),
              },
            });
          return (
            <details key={item.id} open>
              <summary>Mục {i + 1}</summary>
              <Field
                label="Nhãn lựa chọn"
                value={item.label}
                onChange={(label) => update({ label })}
              />
              <Field
                label="Biểu tượng"
                value={item.icon}
                onChange={(icon) => update({ icon })}
              />
              <CheckField
                label="Lựa chọn phù hợp"
                value={item.isValid}
                onChange={(isValid) => update({ isValid })}
              />
              <Field
                label="Phản hồi"
                value={item.feedback}
                multiline
                onChange={(feedback) => update({ feedback })}
              />
              <button
                onClick={() => {
                  if (confirm("Xóa mục khởi động này?"))
                    edit({
                      ...s,
                      data: {
                        ...s.data,
                        items: s.data.items.filter((x) => x.id !== item.id),
                      },
                    });
                }}
              >
                Xóa mục
              </button>
            </details>
          );
        })}
        <button
          onClick={() =>
            edit({
              ...s,
              data: {
                ...s.data,
                items: [
                  ...s.data.items,
                  {
                    id: crypto.randomUUID(),
                    label: "Lựa chọn mới",
                    icon: "",
                    feedback: "",
                    isValid: true,
                  },
                ],
              },
            })
          }
        >
          Thêm mục khởi động
        </button>
      </>
    );
  if (s.type === "scenario")
    return (
      <>
        {(["character", "context", "situation", "question"] as const).map(
          (key, i) => (
            <Field
              key={key}
              label={["Nhân vật", "Bối cảnh", "Tình huống", "Câu hỏi xử lý"][i]}
              value={s.data[key]}
              multiline
              onChange={(v) => edit({ ...s, data: { ...s.data, [key]: v } })}
            />
          ),
        )}
        <CheckField
          label="Cho phép thử lại tình huống"
          value={s.data.allowRetry}
          onChange={(allowRetry) =>
            edit({ ...s, data: { ...s.data, allowRetry } })
          }
        />
        {s.data.choices.map((c, i) => {
          const update = (patch: Partial<typeof c>) =>
            edit({
              ...s,
              data: {
                ...s.data,
                choices: s.data.choices.map((x) =>
                  x.id === c.id ? { ...x, ...patch } : x,
                ),
              },
            });
          return (
            <details key={c.id} open>
              <summary>Phương án {c.label}</summary>
              <Field
                label="Nhãn phương án"
                value={c.label}
                onChange={(label) => update({ label })}
              />
              <Field
                label="Cách xử lý"
                value={c.text}
                multiline
                onChange={(text) => update({ text })}
              />
              <CheckField
                label="Cách xử lý được khuyến nghị"
                value={c.isRecommended}
                onChange={(v) => {
                  if (
                    !v &&
                    s.data.choices.filter((x) => x.isRecommended).length === 1
                  )
                    return;
                  update({ isRecommended: v });
                }}
              />
              <Field
                label="Phản hồi sư phạm"
                value={c.feedback}
                multiline
                onChange={(feedback) => update({ feedback })}
              />
              <Field
                label="Kết quả / hệ quả"
                value={c.consequence}
                multiline
                onChange={(consequence) => update({ consequence })}
              />
              <button
                disabled={s.data.choices.length <= 2}
                onClick={() => {
                  if (!confirm("Xóa phương án này?")) return;
                  const choices = s.data.choices.filter((_, j) => j !== i);
                  if (!choices.some((x) => x.isRecommended))
                    choices[0] = { ...choices[0], isRecommended: true };
                  edit({ ...s, data: { ...s.data, choices } });
                }}
              >
                Xóa phương án
              </button>
            </details>
          );
        })}
        <button
          disabled={s.data.choices.length >= 4}
          onClick={() =>
            edit({
              ...s,
              data: {
                ...s.data,
                choices: [
                  ...s.data.choices,
                  {
                    ...defaultChoice(s.data.choices.length),
                    isRecommended: false,
                  },
                ],
              },
            })
          }
        >
          Thêm phương án
        </button>
      </>
    );
  if (s.type === "quiz")
    return (
      <QuizEditor data={s.data} onChange={(data) => edit({ ...s, data })} />
    );
  if (s.type === "summary")
    return (
      <>
        {(
          [
            ["keyMessages", "Thông điệp chính"],
            ["safetyTips", "Lời khuyên an toàn"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={s.data[key].join("\n")}
            multiline
            onChange={(v) =>
              edit({ ...s, data: { ...s.data, [key]: toLines(v) } })
            }
          />
        ))}
        {s.data.mindMapNodes.map((n) => (
          <details key={n.id} open>
            <summary>Nhánh tổng kết</summary>
            <Field
              label="Tên nhánh"
              value={n.label}
              onChange={(label) =>
                edit({
                  ...s,
                  data: {
                    ...s.data,
                    mindMapNodes: s.data.mindMapNodes.map((x) =>
                      x.id === n.id ? { ...x, label } : x,
                    ),
                  },
                })
              }
            />
            <Field
              label="Diễn giải"
              value={n.description}
              multiline
              onChange={(description) =>
                edit({
                  ...s,
                  data: {
                    ...s.data,
                    mindMapNodes: s.data.mindMapNodes.map((x) =>
                      x.id === n.id ? { ...x, description } : x,
                    ),
                  },
                })
              }
            />
          </details>
        ))}
        <button
          onClick={() =>
            edit({
              ...s,
              data: {
                ...s.data,
                mindMapNodes: [
                  ...s.data.mindMapNodes,
                  {
                    id: crypto.randomUUID(),
                    label: "Nhánh mới",
                    description: "",
                  },
                ],
              },
            })
          }
        >
          Thêm nhánh tổng kết
        </button>
        {s.data.helpChannels.map((h) => (
          <details open key={h.id}>
            <summary>Kênh hỗ trợ</summary>
            <CheckField
              label="Hiển thị kênh hỗ trợ"
              value={h.enabled}
              onChange={(enabled) =>
                edit({
                  ...s,
                  data: {
                    ...s.data,
                    helpChannels: s.data.helpChannels.map((x) =>
                      x.id === h.id ? { ...x, enabled } : x,
                    ),
                  },
                })
              }
            />
            {(["label", "value", "description"] as const).map((key, i) => (
              <Field
                key={key}
                label={
                  ["Tên kênh hỗ trợ", "Thông tin liên hệ", "Mô tả kênh"][i]
                }
                value={h[key]}
                onChange={(v) =>
                  edit({
                    ...s,
                    data: {
                      ...s.data,
                      helpChannels: s.data.helpChannels.map((x) =>
                        x.id === h.id ? { ...x, [key]: v } : x,
                      ),
                    },
                  })
                }
              />
            ))}
          </details>
        ))}
        <button
          onClick={() =>
            edit({
              ...s,
              data: {
                ...s.data,
                helpChannels: [
                  ...s.data.helpChannels,
                  {
                    id: crypto.randomUUID(),
                    label: "Kênh hỗ trợ mới",
                    value: "",
                    description: "",
                    enabled: true,
                  },
                ],
              },
            })
          }
        >
          Thêm kênh hỗ trợ
        </button>
      </>
    );
  if (s.type === "completion")
    return (
      <>
        {(["message", "reviewLabel", "retryLabel"] as const).map((key, i) => (
          <Field
            key={key}
            label={["Lời kết", "Nhãn nút ôn tập", "Nhãn nút làm lại"][i]}
            value={s.data[key]}
            onChange={(v) => edit({ ...s, data: { ...s.data, [key]: v } })}
          />
        ))}
      </>
    );
  return (
    <p className="callout">
      Dữ liệu gốc được giữ nguyên, loại hoạt động này chưa được hỗ trợ.
    </p>
  );
}
