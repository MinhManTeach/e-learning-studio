import type { QuizData } from "../model/schema";
import { defaultQuestion } from "../slides/defaults";
import { correctIndexes, withCorrect } from "../model/answers";
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
        const replace = (next: typeof q) =>
          onChange({
            ...d,
            questions: d.questions.map((x) => (x.id === q.id ? next : x)),
          });
        const update = (patch: Partial<typeof q>) => replace({ ...q, ...patch });
        return (
          <details className="question-editor" key={q.id}>
            <summary>
              Câu {index + 1}: {q.prompt}
              {q.answerUnknown && (
                <span className="answer-unknown-badge">
                  {" "}
                  · Chưa chọn đáp án
                </span>
              )}
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
            <fieldset className="correct-answers">
              <legend>Đáp án đúng (có thể chọn nhiều)</legend>
              {q.answerUnknown && (
                <p className="answer-unknown" role="alert">
                  ⚠ PowerPoint không cho biết đáp án đúng của câu này. Hãy tích
                  đáp án đúng; chưa chọn thì chưa xuất được gói.
                </p>
              )}
              {q.options.map((o, i) => {
                const right = correctIndexes(q);
                const checked = !q.answerUnknown && right.includes(i);
                return (
                  <label key={o.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const base = q.answerUnknown ? [] : right;
                        const next = checked
                          ? base.filter((x) => x !== i)
                          : [...base, i];
                        // Keep at least one right answer.
                        if (next.length) replace(withCorrect(q, next));
                      }}
                    />
                    Lựa chọn {i + 1}
                    {o.text ? `: ${o.text}` : ""}
                  </label>
                );
              })}
              {correctIndexes(q).length > 1 && !q.answerUnknown && (
                <p className="hint">
                  Học sinh phải chọn đủ tất cả đáp án đúng mới được điểm.
                </p>
              )}
            </fieldset>
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
