import { useState } from "react";
import type { PedagogicalAnalysis } from "../import/model";
import {
  confirmPeriods,
  periodReviewWarnings,
  type PeriodReview,
} from "./periods";

export function PeriodSelection({
  analysis: a,
  change,
}: {
  analysis: PedagogicalAnalysis;
  change: (review: PeriodReview | undefined) => void;
}) {
  const [ids, setIds] = useState(a.periodReview?.selectedPeriodIds ?? []);
  const [minutes, setMinutes] = useState(
    a.periodReview?.minutesPerPeriod ?? a.minutesPerPeriod ?? 35,
  );
  const [assigned, setAssigned] = useState(
    a.periodReview?.assignedAssessmentIds ?? [],
  );
  const [unassigned, setUnassigned] = useState(
    a.periodReview?.includedUnassignedActivityIds ?? [],
  );
  const [error, setError] = useState("");
  if (!a.teachingPeriods?.length) return null;
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  return (
    <section className="period-selection" aria-label="Chọn tiết và thời lượng">
      <h2>Chọn tiết nguồn cho bài giảng</h2>
      <p>
        Nguồn khai báo: {a.periodCount ?? "?"} tiết ×{" "}
        {a.minutesPerPeriod ?? "?"} phút. Giáo viên quyết định phần được sử
        dụng; các tiết khác vẫn giữ trong nguồn.
      </p>
      <fieldset>
        <legend>Tiết được chọn</legend>
        {a.teachingPeriods.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={ids.includes(p.id)}
              onChange={() => {
                setIds(toggle(ids, p.id));
                change(undefined);
              }}
            />{" "}
            Tiết {p.number} · {p.durationMinutes ?? "Chưa rõ"} phút
            <details>
              <summary>Đối chiếu nguồn tiết {p.number}</summary>
              <p>{p.source.sourceText}</p>
              <small>
                {p.source.blockId}
                {p.source.row !== undefined
                  ? ` · hàng ${p.source.row + 1}`
                  : ""}
              </small>
            </details>
          </label>
        ))}
      </fieldset>
      <label>
        Phút mỗi tiết được xác nhận{" "}
        <input
          type="number"
          min="1"
          value={minutes}
          onChange={(e) => {
            setMinutes(Number(e.target.value));
            change(undefined);
          }}
        />
      </label>
      <p>
        {ids.length} tiết được chọn · Tổng thời lượng xác nhận:{" "}
        {ids.length * minutes} phút
      </p>
      {a.teachingActivities.some((t) => !t.periodId) && (
        <details>
          <summary>Hoạt động chưa gắn tiết · chọn riêng nếu cần</summary>
          {a.teachingActivities
            .filter((t) => !t.periodId)
            .map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={unassigned.includes(t.id)}
                  onChange={() => {
                    setUnassigned(toggle(unassigned, t.id));
                    change(undefined);
                  }}
                />
                {t.title}
              </label>
            ))}
        </details>
      )}
      {(a.assessments ?? []).some((q) => q.reviewStatus === "READY") && (
        <details>
          <summary>Gán riêng câu hỏi đã duyệt vào phần được chọn</summary>
          {a
            .assessments!.filter((q) => q.reviewStatus === "READY")
            .map((q) => (
              <label key={q.id}>
                <input
                  type="checkbox"
                  checked={assigned.includes(q.id)}
                  onChange={() => {
                    setAssigned(toggle(assigned, q.id));
                    change(undefined);
                  }}
                />
                {q.prompt}
              </label>
            ))}
        </details>
      )}
      <button
        disabled={!ids.length || minutes <= 0}
        onClick={() => {
          try {
            const next = confirmPeriods(a, ids, ids.length, minutes);
            change({
              ...next.periodReview!,
              assignedAssessmentIds: assigned,
              includedUnassignedActivityIds: unassigned,
            });
            setError("");
          } catch {
            setError("Kiểm tra lại tiết và thời lượng.");
          }
        }}
      >
        Xác nhận lựa chọn tiết
      </button>
      {a.periodReview && (
        <p role="status">
          Đã xác nhận {a.periodReview.periodCount} tiết ·{" "}
          {a.periodReview.totalDurationMinutes} phút
        </p>
      )}
      {periodReviewWarnings(a).map((w) => (
        <p key={w.code}>{w.message}</p>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
