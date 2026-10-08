import { useEffect, useRef, useState } from "react";
import type { LessonProject } from "../model/schema";
import {
  analyzeLessonQuality,
  proposeImprovements,
  type ImprovementProposal,
  type QualityIssue,
} from "./analyzer";
import { OptionalAiEnhancementProvider } from "./provider";
import { SlideCanvas } from "../renderers/SlideCanvas";
import "./quality.css";
export function QualityPanel({
  project,
  close,
  navigate,
  apply,
}: {
  project: LessonProject;
  close: () => void;
  navigate: (id: string) => void;
  apply: (proposal: ImprovementProposal) => void;
}) {
  const [issues, setIssues] = useState<QualityIssue[]>(
    () => analyzeLessonQuality(project).issues,
  );
  const [proposals, setProposals] = useState(() =>
    proposeImprovements(project),
  );
  const [selected, setSelected] = useState<ImprovementProposal | null>(null);
  const [status, setStatus] = useState(
    "Kiểm tra theo quy tắc — chưa gọi AI. Không tự động sửa bài.",
  );
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      controller.current?.abort();
      previous?.focus();
    };
  }, []);
  function refresh() {
    setIssues(analyzeLessonQuality(project).issues);
    setProposals(proposeImprovements(project));
    setSelected(null);
    setStatus("Đã phân tích lại theo quy tắc; chưa gọi AI.");
  }
  async function aiReview() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setStatus("Đang kiểm tra kết nối và xin góp ý AI…");
    try {
      const result = await new OptionalAiEnhancementProvider().review(
        project,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      // This snapshot is advisory only; applying any proposal still checks the current reducer state.
      setIssues(result.issues);
      setStatus(result.status);
    } catch {
      if (!abort.signal.aborted)
        setStatus("Đã dừng góp ý; bài được giữ nguyên.");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quality-panel"
      aria-labelledby="quality-title"
      onCancel={close}
    >
      <header>
        <div>
          <p className="eyebrow">GIÁO VIÊN DUYỆT TRƯỚC KHI ÁP DỤNG</p>
          <h2 id="quality-title">Rà soát chất lượng bài học</h2>
        </div>
        <button onClick={close}>Đóng rà soát</button>
      </header>
      <p role="status">{status}</p>
      <p>
        Ước lượng từ thời lượng trang:{" "}
        {analyzeLessonQuality(project).estimatedMinutes} /{" "}
        {project.metadata.durationMinutes} phút. Các ngưỡng chỉ hỗ trợ biên tập,
        không đo hiệu quả học tập.
      </p>
      <div className="quality-actions">
        <button onClick={refresh} disabled={busy}>
          Phân tích lại
        </button>
        <button onClick={() => void aiReview()} disabled={busy}>
          Xin góp ý AI (tùy chọn)
        </button>
      </div>
      <h3>Điểm cần xem lại</h3>
      {!issues.length && (
        <p>
          Chưa phát hiện vấn đề bằng các quy tắc hiện có; vẫn cần giáo viên kiểm
          tra nguồn.
        </p>
      )}
      <ul className="quality-issues">
        {issues.map((issue, i) => (
          <li key={i}>
            <strong>
              {issue.severity === "WARNING" ? "Cần xem lại" : "Lưu ý"} ·{" "}
              {issue.issueCode}
            </strong>
            <p>{issue.explanation}</p>
            <p>{issue.suggestedAction}</p>
            {issue.slideId && (
              <button
                onClick={() => {
                  navigate(issue.slideId!);
                  close();
                }}
              >
                Đến trang{" "}
                {project.slides.findIndex((s) => s.id === issue.slideId) + 1}
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>Đề xuất có thể áp dụng</h3>
      <p>
        Giữ nguyên bài nếu bỏ qua. Đề xuất cũ bị chặn khi trang đã được sửa. Các
        góp ý AI là lời khuyên; chỉ các thay đổi giới hạn bên dưới có nút áp
        dụng.
      </p>
      {proposals.map((p) => (
        <div className="quality-proposal" key={p.id}>
          <strong>
            {project.slides.find((s) => s.id === p.slideId)?.title}
          </strong>
          <p>{p.explanation}</p>
          <button onClick={() => setSelected(p)}>Xem trước {p.kind}</button>
          <button
            onClick={() => {
              setProposals((old) => old.filter((x) => x.id !== p.id));
              if (selected?.id === p.id) setSelected(null);
            }}
          >
            Bỏ qua {p.kind}
          </button>
        </div>
      ))}
      {selected && (
        <section aria-label="Xem trước đề xuất">
          <h3>Trước</h3>
          <SlideCanvas
            project={project}
            slide={project.slides.find((s) => s.id === selected.slideId)}
          />
          <h3>Sau</h3>
          {selected.replacements.map((s) => (
            <SlideCanvas key={s.id} project={project} slide={s} />
          ))}
          <button
            className="primary"
            onClick={() => {
              apply(selected);
              close();
            }}
          >
            Duyệt và áp dụng đề xuất
          </button>
        </section>
      )}
    </dialog>
  );
}
