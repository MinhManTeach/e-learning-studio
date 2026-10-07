import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  FileUp,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  importPastedPlan,
  importPlanFile,
  supportedPlanFormats,
} from "./documents";
import { analysisSteps } from "./analyzer";
import {
  LessonAnalysisService,
  type AnalysisServiceResult,
} from "./analysisService";
import type {
  AnalysisProgress,
  ImportedLessonDocument,
  LessonAnalysisProvider,
  PedagogicalAnalysis,
} from "./model";
import { analysisSchema } from "./model";
import { AnalysisReview } from "./AnalysisReview";
import { DocumentDiagnostics } from "./DocumentDiagnostics";
import {
  confirmAnalysis,
  correctClassification,
  editAnalysis,
  type AnalysisDraft,
} from "./review";
const defaultService = new LessonAnalysisService();
export function LessonImportWizard({
  active,
  initialMode,
  onClose,
  provider,
  service = defaultService,
  aiConfigured = false,
}: {
  active: boolean;
  initialMode: "paste" | "file";
  onClose: () => void;
  provider?: LessonAnalysisProvider;
  service?: LessonAnalysisService;
  aiConfigured?: boolean;
}) {
  const [mode, setMode] = useState(initialMode);
  const [rawText, setRawText] = useState("");
  const [document, setDocument] = useState<ImportedLessonDocument | null>(null);
  const [draft, setDraft] = useState<AnalysisDraft | null>(null);
  const [step, setStep] = useState<
    "input" | "analyzing" | "review" | "confirmed"
  >("input");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState("");
  const [analysisSource, setAnalysisSource] =
    useState<AnalysisServiceResult | null>(null);
  const [reading, setReading] = useState(false);
  const [replacePrompt, setReplacePrompt] = useState(false);
  const [requestedMode, setRequestedMode] = useState<"AI" | "BASIC">("AI");
  const [runningAi, setRunningAi] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const fileRequest = useRef(0);
  useEffect(() => {
    if (active) setMode(initialMode);
  }, [active, initialMode]);
  useEffect(
    () => () => {
      abort.current?.abort();
      fileRequest.current++;
    },
    [],
  );
  async function readFile(selected: File) {
    const request = ++fileRequest.current;
    setReading(true);
    setError("");
    try {
      const doc = await importPlanFile(selected);
      if (request !== fileRequest.current) return;
      setDocument(doc);
      setRawText(doc.rawText);
    } catch (e) {
      if (request === fileRequest.current)
        setError(
          e instanceof Error ? e.message : "Không đọc được tệp. Hãy thử lại.",
        );
    } finally {
      if (request === fileRequest.current) setReading(false);
    }
  }
  async function analyze(selectedMode = requestedMode) {
    setReplacePrompt(false);
    setError("");
    let doc: ImportedLessonDocument;
    try {
      doc =
        document?.rawText === rawText ? document : importPastedPlan(rawText);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setDocument(doc);
    setStep("analyzing");
    setProgress(null);
    setRunningAi(aiConfigured && selectedMode === "AI");
    try {
      const outcome = await (
        provider
          ? new LessonAnalysisService(undefined, provider)
          : selectedMode === "BASIC"
            ? defaultService
            : service
      ).analyze(doc, {
        onProgress: (p) => {
          if (!controller.signal.aborted) setProgress(p);
        },
        signal: controller.signal,
      });
      const result = analysisSchema.parse(outcome.analysis);
      if (controller.signal.aborted) return;
      if (
        draft?.analysis.teacherEditedFields.length &&
        outcome.aiStatus === "UNAVAILABLE"
      ) {
        setError(
          "Không thể kết nối AI. Đã giữ nguyên bản chỉnh sửa của thầy/cô. Hãy thử lại.",
        );
        setStep("review");
        return;
      }
      if (result.sourceDocumentId !== doc.id)
        throw new Error("Kết quả chưa khớp kế hoạch nguồn. Vui lòng thử lại.");
      setDraft({ document: doc, analysis: result, confirmedAt: null });
      setAnalysisSource(outcome);
      setStep("review");
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Chưa phân tích được kế hoạch. Hãy thử lại.",
        );
        setStep(draft ? "review" : "input");
      }
    }
  }
  function requestAnalysis(selectedMode: "AI" | "BASIC" = "AI") {
    setRequestedMode(selectedMode);
    if (draft?.analysis.teacherEditedFields.length) setReplacePrompt(true);
    else void analyze(selectedMode);
  }
  function close() {
    abort.current?.abort();
    fileRequest.current++;
    setReading(false);
    if (step === "analyzing") setStep("input");
    onClose();
  }
  function edit(field: keyof PedagogicalAnalysis, value: unknown) {
    if (draft)
      setDraft({
        ...draft,
        analysis: editAnalysis(draft.analysis, field, value as never),
        confirmedAt: null,
      });
  }
  if (!active) return null;
  return (
    <div className="import-workspace">
      <header className="import-header">
        <button onClick={close}>
          <ArrowLeft size={16} />
          Bài giảng gần đây
        </button>
        <a
          className="import-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            close();
          }}
        >
          E-Learning Studio
        </a>
        <span className="local-badge">
          <ShieldCheck size={15} />
          {analysisSource?.source === "AI"
            ? "Phân tích bằng AI"
            : "Phân tích cơ bản · Phân tích cục bộ"}
        </span>
      </header>
      <main className="import-main">
        <nav className="import-steps" aria-label="Các bước tạo bài">
          <span className={step === "input" ? "current" : ""}>
            01 · Nhập kế hoạch
          </span>
          <ArrowRight size={14} />
          <span className={step === "analyzing" ? "current" : ""}>
            02 · Phân tích
          </span>
          <ArrowRight size={14} />
          <span className={step === "review" ? "current" : ""}>
            03 · Giáo viên kiểm tra
          </span>
          <ArrowRight size={14} />
          <span className={step === "confirmed" ? "current" : ""}>
            04 · Xác nhận
          </span>
        </nav>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {step === "input" && (
          <>
            <div className="import-intro">
              <span className="eyebrow">TỪ KẾ HOẠCH ĐẾN BÀI HỌC</span>
              <h1>Tạo bài giảng bằng AI</h1>
              <p>
                Bắt đầu bằng kế hoạch bài dạy của thầy/cô.
                <br />
                E-Learning Studio sẽ đọc cấu trúc và đưa ra bản phân tích để
                thầy/cô kiểm tra.
              </p>
              <div className="local-explanation">
                <ShieldCheck size={16} />
                {aiConfigured
                  ? "AI đã được cấu hình. Khi phân tích bằng AI, kế hoạch hiện tại được gửi tới nhà cung cấp AI."
                  : "AI chưa được kết nối. Đang dùng chế độ phân tích cơ bản."}
              </div>
            </div>
            <section className="import-input-card">
              <div
                className="import-tabs"
                role="group"
                aria-label="Cách nhập kế hoạch"
              >
                <button
                  className={mode === "paste" ? "selected" : ""}
                  aria-pressed={mode === "paste"}
                  onClick={() => setMode("paste")}
                >
                  <FileText size={18} />
                  Dán nội dung
                </button>
                <button
                  className={mode === "file" ? "selected" : ""}
                  aria-pressed={mode === "file"}
                  onClick={() => setMode("file")}
                >
                  <FileUp size={18} />
                  Nhập tệp
                </button>
              </div>
              {mode === "file" && (
                <div className="plan-upload">
                  <FileUp size={31} />
                  <h2>Nhập kế hoạch bài dạy</h2>
                  <p>
                    Chọn DOCX hoặc TXT UTF-8 dưới 2 MB, tối đa 200.000 ký tự sau
                    khi đọc.
                  </p>
                  <button
                    onClick={() => file.current?.click()}
                    disabled={reading}
                  >
                    {reading ? "Đang đọc tệp…" : "Chọn tệp DOCX hoặc TXT"}
                  </button>
                  <div className="format-badges">
                    {supportedPlanFormats.map((f) => (
                      <span key={f.extension}>
                        {f.extension} ·{" "}
                        {f.supported ? "Đã hỗ trợ" : "Sắp hỗ trợ"}
                      </span>
                    ))}
                  </div>
                  <p className="hint">
                    DOCX giữ cấu trúc đoạn và bảng. PDF sắp hỗ trợ; có thể sao
                    chép văn bản rồi chọn Dán nội dung.
                  </p>
                </div>
              )}
              <input
                type="file"
                hidden
                ref={file}
                accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void readFile(selected);
                  e.target.value = "";
                }}
              />
              <label className="plan-text">
                <span>
                  {document?.fileName
                    ? `Văn bản từ ${document.fileName}`
                    : "Nội dung kế hoạch bài dạy"}
                </span>
                <textarea
                  value={rawText}
                  disabled={reading || document?.sourceType === "DOCX"}
                  rows={16}
                  placeholder="Dán toàn bộ kế hoạch bài dạy vào đây..."
                  onChange={(e) => setRawText(e.target.value)}
                />
              </label>
              {document?.sourceType === "DOCX" && (
                <p className="hint">
                  Đây là bản chữ để đối chiếu. Cấu trúc bảng/đoạn vẫn được giữ
                  khi phân tích; sửa nội dung tại bước giáo viên kiểm tra. Muốn
                  phân tích văn bản khác, chọn{" "}
                  <button
                    onClick={() => {
                      setDocument(null);
                      setRawText("");
                      setMode("paste");
                    }}
                  >
                    Dán kế hoạch khác
                  </button>
                  .
                </p>
              )}
              <div className="plan-input-footer">
                <span>
                  {rawText.length.toLocaleString("vi-VN")} ký tự · Nội dung
                  trống sẽ không được tự bổ sung
                </span>
                <button
                  className="primary large"
                  disabled={reading || !rawText.trim()}
                  onClick={() => requestAnalysis()}
                >
                  <Sparkles size={17} />
                  {aiConfigured
                    ? "Phân tích bằng AI"
                    : "Phân tích kế hoạch bài dạy"}
                </button>
                {aiConfigured ? (
                  <button
                    disabled={reading || !rawText.trim()}
                    onClick={() => requestAnalysis("BASIC")}
                  >
                    Phân tích cơ bản
                  </button>
                ) : (
                  <span>Phân tích cơ bản</span>
                )}
              </div>
              {draft && draft.document.rawText === rawText && (
                <button
                  className="resume-review"
                  onClick={() =>
                    setStep(draft.confirmedAt ? "confirmed" : "review")
                  }
                >
                  Tiếp tục bản đã kiểm tra <ArrowRight size={15} />
                </button>
              )}
            </section>
            <p className="import-session-note">
              Bản phân tích được giữ trong phiên làm việc này. Tải lại trang sẽ
              xóa bản nháp phân tích; bài giảng đã lưu vẫn được giữ.
            </p>
          </>
        )}
        {step === "analyzing" && (
          <section
            className="analysis-progress"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="analysis-orbit">
              <Sparkles size={32} />
            </span>
            <h1>
              {runningAi
                ? "Đang phân tích ngữ nghĩa toàn bộ kế hoạch bằng AI..."
                : "Đang đọc kế hoạch bài dạy..."}
            </h1>
            <p>
              {runningAi
                ? "Đang đối chiếu yêu cầu cần đạt, năng lực, phẩm chất, hoạt động và tích hợp AI. Vui lòng chờ kết quả đầy đủ."
                : "Đối chiếu các phần trong văn bản của thầy/cô ngay tại thiết bị."}
            </p>
            {!runningAi && (
              <>
                <progress
                  aria-label="Tiến độ phân tích"
                  max={analysisSteps.length}
                  value={
                    progress ? progress.index + (progress.completed ? 1 : 0) : 0
                  }
                />
                <ol>
                  {analysisSteps.map((label, i) => (
                    <li
                      className={
                        progress &&
                        (i < progress.index ||
                          (i === progress.index && progress.completed))
                          ? "done"
                          : ""
                      }
                      key={label}
                    >
                      <span>
                        {progress &&
                        (i < progress.index ||
                          (i === progress.index && progress.completed)) ? (
                          <Check size={17} />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      {label}
                    </li>
                  ))}
                </ol>
              </>
            )}
            <button
              onClick={() => {
                abort.current?.abort();
                setStep("input");
              }}
            >
              Dừng và quay lại
              {runningAi && " · Hủy phân tích"}
            </button>
          </section>
        )}
        {step === "review" && draft && (
          <>
            <details className="raw-source">
              <summary>
                Đối chiếu kế hoạch nguồn
                {draft.document.fileName ? ` · ${draft.document.fileName}` : ""}
              </summary>
              <pre>{draft.document.rawText}</pre>
            </details>
            <AnalysisReview
              sourceStatus={
                analysisSource?.source === "AI"
                  ? "Phân tích bằng AI"
                  : aiConfigured && requestedMode === "BASIC"
                    ? "Phân tích cơ bản · Đã chọn phân tích trên thiết bị."
                    : `${analysisSource?.aiStatus === "UNAVAILABLE" ? "Không thể kết nối AI. Kết quả hiện tại được tạo bằng chế độ phân tích cơ bản. AI tạm thời không khả dụng" : analysisSource?.aiStatus === "DEVELOPMENT" ? "Bản thử nghiệm phát triển" : "AI chưa được kết nối"} · Phân tích cục bộ · Đang dùng chế độ phân tích cơ bản.`
              }
              diagnostics={
                <DocumentDiagnostics
                  document={draft.document}
                  analysis={draft.analysis}
                  correct={(id, category) => {
                    try {
                      setDraft({
                        ...draft,
                        analysis: correctClassification(
                          draft.analysis,
                          id,
                          category,
                        ),
                        confirmedAt: null,
                      });
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              }
              analysis={draft.analysis}
              edit={edit}
              back={() => setStep("input")}
              reanalyze={() => requestAnalysis()}
              confirm={() => {
                setDraft(confirmAnalysis(draft, true));
                setStep("confirmed");
              }}
            />
          </>
        )}
        {step === "confirmed" && draft && (
          <section className="analysis-confirmed">
            <CheckCircle2 size={48} />
            <span className="eyebrow">ĐÃ XÁC NHẬN NỘI DUNG</span>
            <h1>Kế hoạch đã sẵn sàng cho bước tiếp theo</h1>
            <h2>
              {draft.analysis.lessonTitle || "Kế hoạch bài dạy của thầy/cô"}
            </h2>
            <p>
              {draft.analysis.subject || "Chưa xác định môn"}
              {draft.analysis.curriculumGrade
                ? ` · Lớp ${draft.analysis.curriculumGrade}`
                : ""}
              {draft.analysis.durationMinutes !== null
                ? ` · ${draft.analysis.durationMinutes} phút`
                : ""}
            </p>
            <p>
              Đã giữ bản phân tích và các chỉnh sửa của thầy/cô trong phiên làm
              việc này.
            </p>
            <div className="next-phase-note">
              <strong>Tiếp theo: xây dựng cấu trúc bài e-learning</strong>
              <p>
                Tính năng tự tạo cấu trúc và trang bài giảng sẽ có ở giai đoạn
                tiếp theo. Hiện tại chưa tạo bài giảng mới.
              </p>
            </div>
            <div className="wizard-actions">
              <button onClick={() => setStep("review")}>
                Kiểm tra lại nội dung
              </button>
              <button disabled>Tạo bài e-learning · Sắp hỗ trợ</button>
              <button className="primary" onClick={close}>
                Về bài giảng gần đây
              </button>
            </div>
          </section>
        )}
      </main>
      {replacePrompt && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reanalysis-title"
          >
            <h2 id="reanalysis-title">Phân tích lại từ văn bản nguồn?</h2>
            <p>
              Bản mới sẽ thay thế bản phân tích và các chỉnh sửa trong bản nháp
              hiện tại. Kế hoạch nguồn và bài giảng đã lưu vẫn được giữ.
            </p>
            <div className="modal-actions">
              <button autoFocus onClick={() => setReplacePrompt(false)}>
                Giữ bản chỉnh sửa
              </button>
              <button className="primary" onClick={() => void analyze()}>
                Phân tích lại từ nguồn
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
