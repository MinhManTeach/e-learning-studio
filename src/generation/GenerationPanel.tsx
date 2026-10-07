import type { LessonProject } from "../model/schema";
import { generationSteps, type GenerationResult } from "./model";

export function GenerationPanel({
  progress,
  result,
  open,
  back,
}: {
  progress: number | null;
  result: GenerationResult | null;
  open?: (project: LessonProject, preview: boolean) => void;
  back: () => void;
}) {
  if (!result)
    return (
      <section
        className="analysis-progress"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="eyebrow">TẠO BÀI CƠ BẢN · TRÊN THIẾT BỊ</span>
        <h1>{generationSteps[progress ?? 0]}</h1>
        <p>Đang tạo nội dung từ kịch bản thầy/cô đã duyệt.</p>
        <progress
          aria-label="Tiến độ tạo bài giảng"
          max={generationSteps.length}
          value={(progress ?? 0) + 1}
        />
        <ol>
          {generationSteps.map((step, i) => (
            <li key={step} className={i < (progress ?? 0) ? "done" : ""}>
              {step}
            </li>
          ))}
        </ol>
      </section>
    );
  const p = result.project;
  const media = p.slides.filter((s) =>
    s.media.suggestion.includes("Bắt buộc: Có"),
  ).length;
  return (
    <section className="analysis-confirmed">
      <span className="eyebrow">ĐÃ TẠO VÀ LƯU TRÊN THIẾT BỊ</span>
      <h1>Bài giảng đã được tạo</h1>
      <h2>{p.metadata.projectTitle}</h2>
      <div className="blueprint-stats">
        <span>
          <strong>{p.slides.length}</strong> trang
        </span>
        <span>
          <strong>
            {
              p.slides.filter((s) =>
                ["warmup", "scenario", "quiz"].includes(s.type),
              ).length
            }
          </strong>{" "}
          hoạt động
        </span>
        <span>
          <strong>
            {p.slides.reduce(
              (n, s) => n + (s.type === "quiz" ? s.data.questions.length : 0),
              0,
            )}
          </strong>{" "}
          câu hỏi đánh giá
        </span>
        <span>
          <strong>{media}</strong> trang cần học liệu
        </span>
        <span>
          <strong>{p.metadata.durationMinutes}</strong> phút
        </span>
      </div>
      <p>
        Bản cơ bản đã sẵn sàng để thầy/cô kiểm tra nội dung, câu hỏi và bổ sung
        hình minh họa.
      </p>
      {result.warnings.length > 0 && (
        <details className="blueprint-warnings">
          <summary>Lưu ý cần kiểm tra · {result.warnings.length}</summary>
          <ul>
            {result.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="wizard-actions">
        <button
          className="primary"
          disabled={!open}
          onClick={() => open?.(p, false)}
        >
          Mở bài giảng
        </button>
        <button disabled={!open} onClick={() => open?.(p, true)}>
          Xem trước với vai trò học sinh
        </button>
        <button onClick={back}>Về kịch bản đã duyệt</button>
      </div>
    </section>
  );
}
