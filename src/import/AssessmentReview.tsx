import { assessmentTypes, type Assessment } from "./assessmentModel";
import {
  updateAssessment,
  studentAssessment,
  canConfirmAssessment,
} from "./assessments";
const labels: Record<Assessment["type"], string> = {
  MULTIPLE_CHOICE: "Trắc nghiệm",
  TRUE_FALSE: "Đúng / Sai",
  MATCHING: "Nối cặp",
  ORDERING: "Sắp xếp",
  SHORT_ANSWER: "Trả lời ngắn",
  OBSERVATION: "Quan sát",
  PERFORMANCE: "Thực hành / tiêu chí",
};
export function AssessmentReview({
  items,
  onChange,
}: {
  items: Assessment[];
  onChange: (items: Assessment[]) => void;
}) {
  function change(id: string, patch: Parameters<typeof updateAssessment>[1]) {
    onChange(items.map((q) => (q.id === id ? updateAssessment(q, patch) : q)));
  }
  return (
    <section className="analysis-card" aria-label="Câu hỏi và đánh giá">
      <h2>Câu hỏi và đánh giá ({items.length})</h2>
      <p className="section-help">
        Đáp án chỉ dành cho giáo viên. Nội dung chưa được xác nhận không được
        dùng làm câu hỏi chấm điểm.
      </p>
      {!items.length && (
        <p role="status">Chưa tìm thấy câu hỏi có đủ dấu hiệu trong nguồn.</p>
      )}
      {items.map((q, index) => (
        <details key={q.id}>
          <summary>
            {index + 1}. {q.prompt} ·{" "}
            {q.reviewStatus === "READY"
              ? "Đã xác nhận"
              : q.reviewStatus === "EXCLUDED"
                ? "Đã loại khỏi bài học"
                : "Cần giáo viên kiểm tra"}
          </summary>
          <div className="analysis-field-grid">
            <label>
              Loại câu hỏi
              <select
                aria-label={`Loại câu hỏi ${index + 1}`}
                value={q.type}
                onChange={(e) =>
                  change(q.id, { type: e.target.value as Assessment["type"] })
                }
              >
                {assessmentTypes.map((t) => (
                  <option key={t} value={t}>
                    {labels[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Câu hỏi
              <textarea
                aria-label={`Câu hỏi ${index + 1}`}
                value={q.prompt}
                onChange={(e) => change(q.id, { prompt: e.target.value })}
              />
            </label>
            <label>
              Lựa chọn / cặp nối (mỗi dòng: nhãn. nội dung)
              <textarea
                aria-label={`Lựa chọn ${index + 1}`}
                value={q.choices.map((c) => `${c.label}. ${c.text}`).join("\n")}
                onChange={(e) =>
                  change(q.id, {
                    choices: e.target.value
                      .split("\n")
                      .filter((t) => t.trim())
                      .map((t, i) => {
                        const m = t.match(/^([^.:)]+)[.:)]\s*(.*)$/);
                        return {
                          label: m?.[1] ?? String(i + 1),
                          text: m?.[2] ?? t,
                        };
                      }),
                  })
                }
              />
            </label>
            <label>
              Đáp án — chỉ giáo viên
              <textarea
                aria-label={`Đáp án ${index + 1}`}
                value={q.answer?.value ?? ""}
                onChange={(e) => change(q.id, { answerText: e.target.value })}
              />
            </label>
            <label>
              Giải thích / phản hồi
              <textarea
                aria-label={`Phản hồi ${index + 1}`}
                value={q.feedback}
                onChange={(e) => change(q.id, { feedback: e.target.value })}
              />
            </label>
          </div>
          <p>
            {q.answer?.status === "SOURCE_VERIFIED"
              ? "Đáp án có ghi rõ trong nguồn"
              : q.answer?.status === "TEACHER_CONFIRMED"
                ? "Đáp án do giáo viên chỉnh sửa"
                : "Đáp án thiếu hoặc chưa rõ; cần giáo viên xác minh"}{" "}
            · Độ tin cậy {Math.round(q.confidence * 100)}%
          </p>
          <details>
            <summary>Nguồn gốc và đáp án ứng viên</summary>
            {q.sources.map((s, i) => (
              <p key={i}>
                {s.blockId}
                {s.tableIndex === undefined
                  ? ""
                  : ` · Bảng ${s.tableIndex + 1}, hàng ${(s.row ?? 0) + 1}, cột ${(s.column ?? 0) + 1}`}
                <br />
                {s.sourceText}
              </p>
            ))}
            {q.answerCandidates.map((c, i) => (
              <p key={i}>
                {c.source.blockId} · {c.text}
              </p>
            ))}
          </details>
          <div className="button-row">
            <button
              type="button"
              disabled={!canConfirmAssessment(q)}
              onClick={() => change(q.id, { reviewStatus: "READY" })}
            >
              Xác nhận câu hỏi {index + 1}
            </button>
            <button
              type="button"
              onClick={() =>
                change(q.id, { reviewStatus: "NEEDS_TEACHER_REVIEW" })
              }
            >
              Để kiểm tra sau {index + 1}
            </button>
            <button
              type="button"
              onClick={() => change(q.id, { reviewStatus: "EXCLUDED" })}
            >
              Loại khỏi bài học {index + 1}
            </button>
          </div>
          <StudentAssessmentPreview item={q} />
        </details>
      ))}
    </section>
  );
}
export function StudentAssessmentPreview({
  item,
  submitted = false,
}: {
  item: Assessment;
  submitted?: boolean;
}) {
  const q = studentAssessment(item, submitted);
  return (
    <section aria-label="Xem trước học sinh">
      <h3>Xem trước học sinh</h3>
      <p>{q.prompt}</p>
      <ul>
        {q.choices.map((c, i) => (
          <li key={i}>
            {c.label}. {c.text}
          </li>
        ))}
      </ul>
      {"answer" in q && (
        <p>
          Đáp án sau khi nộp: {q.answer} {q.feedback}
        </p>
      )}
    </section>
  );
}
