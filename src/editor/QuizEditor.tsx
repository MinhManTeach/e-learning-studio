import type { QuizData } from "../model/schema";
import { defaultQuestion } from "../slides/defaults";
import { Field } from "./Fields";
import { CheckField, NumberField, SelectField } from "./Controls";
export function QuizEditor({
  data: d,
  onChange,
}: {
  data: QuizData;
  onChange: (data: QuizData) => void;
}) {
  return (
    <>
      <Field
        label="Hướng dẫn làm bài"
        value={d.instructions}
        multiline
        onChange={(instructions) => onChange({ ...d, instructions })}
      />
      <NumberField
        label="Điểm đạt (%)"
        value={d.passingScore}
        max={100}
        onChange={(passingScore) => onChange({ ...d, passingScore })}
      />
      <NumberField
        label="Số lượt tối đa (0 = không giới hạn)"
        value={d.attemptsAllowed ?? 0}
        onChange={(n) =>
          onChange({ ...d, attemptsAllowed: n === 0 ? null : Math.floor(n) })
        }
      />
      {(
        [
          ["shuffleQuestions", "Đảo thứ tự câu hỏi"],
          ["shuffleAnswers", "Đảo thứ tự đáp án"],
          ["showFeedbackAfterSubmit", "Hiển thị phản hồi sau khi nộp"],
          ["allowReview", "Cho phép xem đáp án"],
        ] as const
      ).map(([key, label]) => (
        <CheckField
          key={key}
          label={label}
          value={d[key]}
          onChange={(value) => onChange({ ...d, [key]: value })}
        />
      ))}
      {d.questions.map((q, index) => {
        const update = (patch: Partial<typeof q>) =>
          onChange({
            ...d,
            questions: d.questions.map((x) =>
              x.id === q.id ? { ...x, ...patch } : x,
            ),
          });
        return (
          <details className="question-editor" key={q.id}>
            <summary>
              Câu {index + 1}: {q.prompt}
            </summary>
            <Field
              label="Câu hỏi"
              value={q.prompt}
              multiline
              onChange={(prompt) => update({ prompt })}
            />
            <SelectField
              label="Mức độ"
              value={q.level}
              options={{
                RECOGNITION: "Nhận biết",
                UNDERSTANDING: "Thông hiểu",
                APPLICATION: "Vận dụng",
              }}
              onChange={(level) => update({ level })}
            />
            <NumberField
              label="Điểm câu hỏi"
              value={q.points}
              onChange={(points) => update({ points })}
            />
            {q.options.map((o, i) => (
              <Field
                key={o.id}
                label={"Lựa chọn " + (i + 1)}
                value={o.text}
                onChange={(text) =>
                  update({
                    options: q.options.map((x) =>
                      x.id === o.id ? { ...x, text } : x,
                    ),
                  })
                }
              />
            ))}
            <SelectField
              label="Đáp án đúng"
              value={String(q.correctAnswerIndex)}
              options={Object.fromEntries(
                q.options.map((_, i) => [String(i), "Lựa chọn " + (i + 1)]),
              )}
              onChange={(value) =>
                update({ correctAnswerIndex: Number(value) })
              }
            />
            <Field
              label="Giải thích đáp án"
              value={q.explanation}
              multiline
              onChange={(explanation) => update({ explanation })}
            />
            <button
              className="danger-text"
              onClick={() => {
                if (confirm("Xóa câu hỏi này?"))
                  onChange({
                    ...d,
                    questions: d.questions.filter((x) => x.id !== q.id),
                  });
              }}
            >
              Xóa câu hỏi
            </button>
          </details>
        );
      })}
      <button
        onClick={() =>
          onChange({ ...d, questions: [...d.questions, defaultQuestion()] })
        }
      >
        Thêm câu hỏi
      </button>
    </>
  );
}
