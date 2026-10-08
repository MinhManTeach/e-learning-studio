import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Image,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  PedagogicalAnalysis,
  ImportedLessonDocument,
} from "../import/model";
import { stageLabels } from "../model/analysis";
import { slideTypeLabels } from "./model";
import {
  addSlide,
  approveBlueprint,
  deleteSlide,
  duplicateSlide,
  editSlide,
  moveSlide,
  regenerateDraft,
  restoreProposal,
  type BlueprintDraft,
} from "./draft";
import { DeterministicLessonBlueprintProvider } from "./generator";
import { validateLessonBlueprint } from "./validation";
import { SlideIntentEditor } from "./SlideIntentEditor";
import { SourceImageReview } from "./SourceImageReview";
import "./blueprint.css";

export function BlueprintReview({
  analysis,
  document,
  initialDraft,
  onChange,
  back,
  close,
  generate,
}: {
  analysis: PedagogicalAnalysis;
  document?: ImportedLessonDocument;
  initialDraft: BlueprintDraft;
  onChange?: (d: BlueprintDraft) => void;
  back: () => void;
  close: () => void;
  generate?: (draft: BlueprintDraft) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [reorder, setReorder] = useState(false);
  const [prompt, setPrompt] = useState<"regenerate" | "restore" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const b = draft.current;
  const warnings = validateLessonBlueprint(b, analysis);
  const sourceWarnings = b.warnings.filter(
    (w) => !warnings.some((v) => v.code === w.code && v.message === w.message),
  );
  const allWarnings = [...warnings, ...sourceWarnings];
  const slides = b.proposedSlides;
  const total = slides.reduce((n, s) => n + s.estimatedMinutes, 0);
  useEffect(() => {
    if (prompt) dialog.current?.showModal();
  }, [prompt]);
  function change(next: BlueprintDraft) {
    setDraft(next);
    onChange?.(next);
  }
  async function replace(action: "regenerate" | "restore") {
    setBusy(true);
    setError("");
    try {
      change(
        action === "restore"
          ? restoreProposal(draft, true)
          : regenerateDraft(
              draft,
              await new DeterministicLessonBlueprintProvider({
                passingScore: b.assessmentPlan.targetPassingScore,
              }).generate(analysis, document),
              true,
            ),
      );
      setEditing(null);
      setPrompt(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Chưa tạo được kịch bản. Hãy thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  function request(action: "regenerate" | "restore") {
    if (draft.edited) setPrompt(action);
    else void replace(action);
  }
  return (
    <section className="blueprint-review" aria-busy={busy}>
      <div className="blueprint-heading">
        <span className="eyebrow">KỊCH BẢN TỪ BẢN PHÂN TÍCH ĐÃ XÁC NHẬN</span>
        <h1>Đề xuất kịch bản bài giảng</h1>
        <h2>{b.title}</h2>
        <p>
          Duyệt trình tự học, tương tác và nhu cầu minh họa trước khi tạo bài
          giảng.
        </p>
      </div>
      {b.periodReview && (
        <section className="period-selection" aria-label="Phạm vi kịch bản">
          <h2>Phạm vi đã xác nhận</h2>
          <p>
            Tiết{" "}
            {b.periodReview.selectedPeriodIds
              .map(
                (id) =>
                  analysis.teachingPeriods?.find((p) => p.id === id)?.number,
              )
              .join(", ")}{" "}
            · {b.periodReview.periodCount} × {b.periodReview.minutesPerPeriod} ={" "}
            {b.periodReview.totalDurationMinutes} phút
          </p>
          <p>
            Thời gian trang là đề xuất. Phân bổ hoạt động nguồn được giữ riêng
            để đối chiếu.
          </p>
          <p>
            {Number(total.toFixed(1))} phút đã phân bổ trên trang ·{" "}
            {Number((b.estimatedDurationMinutes - total).toFixed(1))} phút chênh
            lệch cần giáo viên kiểm tra. Không tự lấp thời gian thiếu.
          </p>
          <p>
            {b.sourceAssessments?.filter(
              (q) => q.reviewStatus === "NEEDS_TEACHER_REVIEW",
            ).length ?? 0}{" "}
            câu hỏi chưa duyệt · {b.assessmentPlan.targetQuestionCount} câu hỏi
            được sử dụng · {analysis.unmappedContent.length} mục nguồn chưa ánh
            xạ
          </p>
          <p>
            {slides.filter((s) => s.sourceImagePlacementId).length} trang dùng
            ảnh DOCX ·{" "}
            {
              slides.filter(
                (s) =>
                  s.mediaIntent?.type !== "NONE" && !s.sourceImagePlacementId,
              ).length
            }{" "}
            ý định học liệu chưa chọn ảnh
          </p>
          <p>
            Tạo lại giữ các chỉnh sửa hiện tại. Khôi phục đề xuất chỉ thay thế
            sau khi thầy/cô xác nhận.
          </p>
          <details>
            <summary>Hoạt động → trang & thời lượng nguồn</summary>
            {b.activityPlan?.map((t) => (
              <div key={t.activity.id}>
                <h3>{t.activity.title}</h3>
                <p>
                  {t.slideIds
                    .map(
                      (id) => b.proposedSlides.find((s) => s.id === id)?.order,
                    )
                    .join(", ") || "Chưa có trang"}{" "}
                  · {t.sourceDurationMinutes ?? "Chưa rõ"} phút nguồn
                </p>
                <pre>{JSON.stringify(t.activity, null, 2)}</pre>
              </div>
            ))}
          </details>
        </section>
      )}
      <div className="blueprint-stats" aria-label="Tóm tắt kịch bản">
        <span>
          <strong>
            {slides.filter((s) => s.sourceImagePlacementId).length}
          </strong>{" "}
          ảnh nguồn được chọn
        </span>
        <span>
          <strong>{slides.length}</strong> trang
        </span>
        <span>
          <strong>{Number(total.toFixed(1))}</strong> phút
          {b.durationSource === "PROPOSED" && " · Thời lượng đề xuất"}
        </span>
        <span>
          <strong>
            {
              slides.filter(
                (s) =>
                  s.interactionIntent && s.interactionIntent.type !== "NONE",
              ).length
            }
          </strong>{" "}
          hoạt động tương tác
        </span>
        <span>
          <strong>{b.assessmentPlan.targetQuestionCount}</strong> câu hỏi đánh
          giá dự kiến
        </span>
        <span>
          <strong>{b.mediaPlan.requiredSlideIds.length}</strong> nội dung cần
          hình minh họa
        </span>
      </div>
      <div className="blueprint-toolbar">
        <button
          onClick={() => {
            const next = addSlide(draft);
            change(next);
            setEditing(
              next.current.proposedSlides.find(
                (s) => !slides.some((old) => old.id === s.id),
              )!.id,
            );
          }}
        >
          <Plus size={16} /> Thêm trang
        </button>
        <button aria-pressed={reorder} onClick={() => setReorder(!reorder)}>
          Sắp xếp lại
        </button>
        <button disabled={busy} onClick={() => request("regenerate")}>
          Tạo lại kịch bản
        </button>
        <button disabled={busy} onClick={() => request("restore")}>
          Khôi phục đề xuất
        </button>
        <span role="status">
          {draft.approvedAt
            ? "Đã duyệt kịch bản"
            : draft.edited
              ? "Đã giữ chỉnh sửa trong phiên"
              : "Đề xuất tự động · Có thể chỉnh sửa"}
        </span>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {allWarnings.length > 0 && (
        <details
          className="blueprint-warnings"
          open={warnings.some((w) => w.severity === "ERROR")}
        >
          <summary>Kiểm tra kịch bản · {allWarnings.length} lưu ý</summary>
          <ul>
            {allWarnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>
                <strong>
                  {
                    { ERROR: "Lỗi", WARNING: "Cảnh báo", INFO: "Thông tin" }[
                      w.severity
                    ]
                  }
                </strong>{" "}
                · {w.message}
                {w.slideId &&
                  ` (trang ${slides.find((s) => s.id === w.slideId)?.order})`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {document && (
        <SourceImageReview
          document={document}
          analysis={analysis}
          draft={draft}
          change={change}
        />
      )}
      <ol className="blueprint-sequence">
        {slides.map((s, index) => (
          <li className="blueprint-card" key={s.id}>
            <div className="blueprint-number">
              {String(s.order).padStart(2, "0")}
            </div>
            <div className="blueprint-card-body">
              <div className="blueprint-meta">
                <strong>
                  {slideTypeLabels[s.type].toLocaleUpperCase("vi")}
                </strong>
                <span>{stageLabels[s.stage]}</span>
                <span>{Number(s.estimatedMinutes.toFixed(1))} phút</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.pedagogicalPurpose}</p>
              <div className="blueprint-intents">
                {s.mediaIntent && s.mediaIntent.type !== "NONE" && (
                  <span title={s.mediaIntent.purpose}>
                    <Image size={14} />
                    {s.mediaIntent.type === "ILLUSTRATION"
                      ? "Minh họa"
                      : "Học liệu"}
                    {s.mediaIntent.required ? " · Cần có" : " · Tùy chọn"}
                  </span>
                )}
                {s.interactionIntent && s.interactionIntent.type !== "NONE" && (
                  <span title={s.interactionIntent.description}>
                    <MessageCircle size={14} />
                    {s.interactionIntent.type === "SCENARIO"
                      ? "Ra quyết định"
                      : s.type === "QUIZ"
                        ? "Đánh giá"
                        : "Tham gia chủ động"}
                  </span>
                )}
              </div>
              {editing === s.id ? (
                <SlideIntentEditor
                  slide={s}
                  analysis={analysis}
                  edit={(patch) => change(editSlide(draft, s.id, patch))}
                  done={() => setEditing(null)}
                />
              ) : (
                <details>
                  <summary>Xem đề cương và ý định thiết kế</summary>
                  <ul>
                    {s.contentOutline.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                  {s.mediaIntent?.type !== "NONE" && (
                    <p>
                      {s.mediaIntent?.purpose}
                      <br />
                      {s.mediaIntent?.visualDescription ||
                        s.mediaIntent?.searchQuery}
                    </p>
                  )}
                  {s.interactionIntent?.type !== "NONE" && (
                    <p>{s.interactionIntent?.description}</p>
                  )}
                </details>
              )}
            </div>
            <div className="blueprint-card-actions">
              <button
                aria-label={`Sửa trang ${s.order}`}
                onClick={() => setEditing(editing === s.id ? null : s.id)}
              >
                <Pencil size={15} />
              </button>
              <button
                aria-label={`Nhân đôi trang ${s.order}`}
                onClick={() => change(duplicateSlide(draft, s.id))}
              >
                <Copy size={15} />
              </button>
              <button
                aria-label={`Xóa trang ${s.order}`}
                onClick={() => change(deleteSlide(draft, s.id))}
              >
                <Trash2 size={15} />
              </button>
              {reorder && (
                <>
                  <button
                    disabled={index === 0}
                    aria-label={`Đưa trang ${s.order} lên`}
                    onClick={() => change(moveSlide(draft, s.id, index - 1))}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    disabled={index === slides.length - 1}
                    aria-label={`Đưa trang ${s.order} xuống`}
                    onClick={() => change(moveSlide(draft, s.id, index + 1))}
                  >
                    <ArrowDown size={15} />
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      <details className="blueprint-plans">
        <summary>Cơ sở thiết kế, đánh giá và hỗ trợ tiếp cận</summary>
        <p>{b.designRationale}</p>
        <p>
          Ngưỡng đạt: {b.assessmentPlan.targetPassingScore}%.{" "}
          {b.assessmentPlan.rationale}
        </p>
        <p>{b.mediaPlan.rationale}</p>
        <ul>
          {[
            ...b.accessibilityPlan.sourceSupport,
            ...b.accessibilityPlan.strategies,
          ].map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </details>
      <div className="wizard-actions blueprint-footer">
        <button onClick={back}>Kiểm tra lại nội dung</button>
        <button
          className="primary"
          disabled={
            allWarnings.some((w) => w.severity === "ERROR") ||
            !!draft.approvedAt
          }
          onClick={() => change(approveBlueprint(draft, analysis))}
        >
          {draft.approvedAt ? "Đã duyệt kịch bản" : "Duyệt kịch bản"}
        </button>
        <button
          disabled={
            !draft.approvedAt ||
            !generate ||
            allWarnings.some((w) => w.severity === "ERROR")
          }
          onClick={() => generate?.(draft)}
        >
          Tạo bài giảng
        </button>
        <button onClick={close}>Về bài giảng gần đây</button>
      </div>
      {prompt && (
        <dialog
          ref={dialog}
          className="modal blueprint-dialog"
          aria-labelledby="blueprint-replace-title"
          onCancel={(e) => {
            e.preventDefault();
            setPrompt(null);
          }}
        >
          <h2 id="blueprint-replace-title">
            {prompt === "regenerate"
              ? "Tạo lại kịch bản?"
              : "Khôi phục đề xuất?"}
          </h2>
          <p>
            {b.periodReview && prompt === "regenerate"
              ? "Tạo lại sẽ giữ các chỉnh sửa hiện tại và cập nhật bản đề xuất để đối chiếu."
              : "Kịch bản hiện tại có chỉnh sửa của thầy/cô. Thao tác này sẽ thay thế các chỉnh sửa này."}
          </p>
          <div className="modal-actions">
            <button autoFocus disabled={busy} onClick={() => setPrompt(null)}>
              Hủy
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void replace(prompt)}
            >
              {prompt === "regenerate" ? "Tạo lại" : "Khôi phục"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
