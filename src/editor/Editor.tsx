import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  GraduationCap,
  LayoutTemplate,
  Pencil,
  Save,
  Trash2,
  Settings,
} from "lucide-react";
import type { LessonProject } from "../model/schema";
import { ZodError } from "zod";
import { ProjectConflictError, type ProjectStore } from "../storage/projects";
import { editorReducer, editorState } from "./reducer";
import { SlideList } from "./SlideList";
import { Properties } from "./Properties";
import { SlideCanvas } from "../renderers/SlideCanvas";
import { StudentPreview } from "../player/StudentPreview";
import { downloadProjectJSON, exportProjectJSON } from "../model/json";
import { consistencyWarnings } from "../model/analysis";
import { MediaPanel } from "../media/MediaPanel";
import { jsonMediaWarning } from "../media/service";
import { QualityPanel } from "../quality/QualityPanel";
import { applyProposal } from "../quality/analyzer";
import { BackupButton } from "../backup/BackupButton";
import { ExportButton } from "../export/ExportButton";
import { AiStudio } from "../ai/AiStudio";
import { localMediaStore } from "../media/storage";
import "../backup/backup.css";

export function Editor({
  project,
  store,
  back,
  initialPreview = false,
}: {
  project: LessonProject;
  store: ProjectStore;
  back: () => void;
  initialPreview?: boolean;
}) {
  const [state, dispatch] = useReducer(editorReducer, project, editorState);
  const [preview, setPreview] = useState(initialPreview);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [jsonExport, setJsonExport] = useState<string | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const inflightSave = useRef<Promise<boolean> | null>(null);
  // updatedAt of the copy last loaded from or written to storage.
  const baseline = useRef(project.updatedAt);
  const [conflict, setConflict] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dirty = state.revision !== savedRevision;
  const slide = state.project.slides.find((s) => s.id === state.selectedId);
  const index = state.project.slides.findIndex(
    (s) => s.id === state.selectedId,
  );
  // Concurrent callers (autosave, Ctrl+S, back) share the in-flight save instead of failing.
  function save(overwrite = false): Promise<boolean> {
    inflightSave.current ??= runSave(overwrite).finally(() => {
      inflightSave.current = null;
    });
    return inflightSave.current;
  }
  async function runSave(overwrite: boolean) {
    setSaving(true);
    setError("");
    try {
      let snapshot;
      do {
        snapshot = stateRef.current;
        await store.save(
          snapshot.project,
          overwrite ? undefined : { expectedUpdatedAt: baseline.current },
        );
        baseline.current = snapshot.project.updatedAt;
        overwrite = false;
        setSavedRevision(snapshot.revision);
      } while (stateRef.current.revision !== snapshot.revision);
      setConflict(false);
      return true;
    } catch (error) {
      if (error instanceof ProjectConflictError) setConflict(true);
      else if (error instanceof ZodError)
        setError(
          "Không thể lưu vì dữ liệu chưa hợp lệ (ví dụ một trường bắt buộc đang trống). Bản đang sửa vẫn còn ở đây; hãy kiểm tra các trường vừa thay đổi rồi lưu lại.",
        );
      else
        setError(
          "Không thể lưu bài. Dữ liệu đang chỉnh sửa vẫn còn ở đây. Hãy kiểm tra dung lượng trình duyệt rồi thử lưu lại.",
        );
      return false;
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!dirty || conflict) return;
    const timeout = window.setTimeout(() => {
      void save();
    }, 900);
    return () => window.clearTimeout(timeout);
    // Every edit restarts the explicit, visible autosave countdown. Manual retry handles failures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.revision, dirty, conflict]);
  useEffect(() => {
    function leave(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function goBack() {
    if (dirty && !(await save())) return;
    back();
  }
  return (
    <div className={"studio " + (preview ? "preview-mode" : "")}>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => void goBack()}
          aria-label="Bài giảng của tôi"
        >
          <span className="brand-icon">
            <GraduationCap size={25} />
          </span>
          <span>
            E-Learning<span className="brand-light"> Studio</span>
          </span>
        </button>
        <span className="top-divider" />
        <div className="project-name">
          <strong>
            {state.project.metadata.projectTitle || "Bài giảng chưa đặt tên"}
          </strong>
          <span>Không gian soạn bài của bạn</span>
        </div>
        <div className="top-actions">
          {!preview && <BackupButton project={state.project} />}
          {!preview && <ExportButton project={state.project} />}
          {!preview && (
            <button className="ai-button" onClick={() => setShowAi(true)}>
              AI thiết kế bài giảng
            </button>
          )}
          {!preview && (
            <button onClick={() => setShowQuality(true)}>
              Rà soát chất lượng
            </button>
          )}
          {!preview && state.qualityUndo && (
            <button onClick={() => dispatch({ type: "quality-undo" })}>
              Hoàn tác cải thiện
            </button>
          )}
          {!preview && (
            <button onClick={() => setShowMedia(true)}>
              Bổ sung hình ảnh cho bài giảng
            </button>
          )}
          {!preview && (
            <button
              onClick={() => {
                try {
                  setJsonExport(exportProjectJSON(stateRef.current.project));
                } catch {
                  setError(
                    "Không thể xuất tệp. Hãy kiểm tra dữ liệu bài giảng.",
                  );
                }
              }}
            >
              Xuất JSON
            </button>
          )}
          <span
            className={"save-status " + (dirty ? "unsaved" : "")}
            role="status"
          >
            {saving ? (
              "Đang lưu…"
            ) : error || conflict ? (
              "Lưu chưa thành công"
            ) : dirty ? (
              "Chưa lưu"
            ) : (
              <>
                <Check size={14} /> Đã lưu
              </>
            )}
          </span>
          <button onClick={() => setPreview((v) => !v)}>
            <Eye size={17} /> {preview ? "Về chỉnh sửa" : "Xem trước"}
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={saving}
          >
            <Save size={17} /> Lưu bài
          </button>
          <button
            className="icon-button"
            aria-label="Cài đặt"
            onClick={() => setShowSettings((v) => !v)}
          >
            <Settings size={19} />
          </button>
        </div>
      </header>
      {showSettings && !preview && (
        <div className="settings-popover">
          <strong>Lưu trữ trên thiết bị</strong>
          <p>
            Bài giảng tự động lưu sau khi bạn ngừng nhập. Theo dõi trạng thái
            “Đã lưu” trước khi đóng trang.
          </p>
          <p>
            Bài giảng nằm trong trình duyệt này. Xóa dữ liệu trình duyệt sẽ xóa
            các bài đã lưu.
          </p>
          <button onClick={() => setShowSettings(false)}>Đã hiểu</button>
        </div>
      )}
      {conflict && (
        <div className="error-banner" role="alert">
          Bài này vừa được lưu ở cửa sổ khác. Để tránh mất nội dung, bản đang
          sửa ở đây chưa được lưu.
          <button onClick={() => void save(true)}>
            Ghi đè bằng bản đang sửa
          </button>
          <button onClick={back}>Bỏ thay đổi, về danh sách</button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => void save()}>Thử lưu lại</button>
        </div>
      )}
      {preview ? (
        <StudentPreview project={state.project} initialId={state.selectedId} />
      ) : (
        <div className="editor-layout">
          <SlideList
            slides={state.project.slides}
            selectedId={state.selectedId}
            select={(id) => dispatch({ type: "select", id })}
            add={(slideType) => dispatch({ type: "add", slideType })}
          />
          <main className="workspace">
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">KHÔNG GIAN SÁNG TẠO</span>
                <h2>
                  {slide
                    ? "Biến ý tưởng thành bài học"
                    : "Một bài học, nhiều điều mới"}
                </h2>
              </div>
              <div className="mode-toggle">
                <button className="active">
                  <Pencil size={14} /> Chỉnh sửa
                </button>
                <button onClick={() => setPreview(true)}>
                  <Eye size={14} /> Xem trước
                </button>
              </div>
            </div>
            <div className="canvas-toolbar">
              <span>
                <LayoutTemplate size={16} />{" "}
                {slide
                  ? `Trang ${index + 1} / ${state.project.slides.length}`
                  : "Tổng quan bài giảng"}
              </span>
              <span className="canvas-ratio">16 : 9</span>
            </div>
            {consistencyWarnings(state.project).map((w) => (
              <p className="callout" key={w.code}>
                {w.message}
              </p>
            ))}
            <SlideCanvas slide={slide} project={state.project} />
            {slide && (
              <div className="slide-tools">
                <div>
                  <button
                    disabled={index <= 0}
                    onClick={() =>
                      dispatch({ type: "move", id: slide.id, direction: -1 })
                    }
                  >
                    <ArrowUp size={16} /> Lên
                  </button>
                  <button
                    disabled={index === state.project.slides.length - 1}
                    onClick={() =>
                      dispatch({ type: "move", id: slide.id, direction: 1 })
                    }
                  >
                    <ArrowDown size={16} /> Xuống
                  </button>
                </div>
                <div>
                  <button
                    onClick={() =>
                      dispatch({ type: "duplicate", id: slide.id })
                    }
                  >
                    <Copy size={16} /> Nhân bản
                  </button>
                  <button
                    className="danger-text"
                    onClick={() => setDeleteTarget(slide.id)}
                  >
                    <Trash2 size={16} /> Xóa
                  </button>
                </div>
              </div>
            )}
            <div className="workspace-tip">
              <span className="tip-icon">✦</span>
              <div>
                <strong>Bài học hay bắt đầu từ bạn</strong>
                <p>
                  Chọn trang bên trái, chỉnh nội dung bên phải. Mọi thay đổi
                  hiển thị ngay trên bài học.
                </p>
              </div>
            </div>
            <button className="back-link" onClick={() => void goBack()}>
              <ArrowLeft size={15} /> Bài giảng của tôi
            </button>
          </main>
          <Properties
            project={state.project}
            editSettings={(settings) =>
              dispatch({ type: "settings", settings })
            }
            mediaChange={(url, alt) => {
              if (slide) dispatch({ type: "media", id: slide.id, url, alt });
            }}
            editObjectives={(objectives) =>
              dispatch({ type: "objectives", objectives })
            }
            slide={slide}
            editMetadata={(metadata) =>
              dispatch({ type: "metadata", metadata })
            }
            editSlide={(slide) => dispatch({ type: "edit", slide })}
          />
        </div>
      )}
      <footer className="app-footer">
        <span>
          <span className="status-dot" /> Lưu trên thiết bị của bạn
        </span>
        <span>
          {preview ? "Xem trước bài học" : "Tự động lưu • Ctrl + S để lưu ngay"}
          <span className="footer-divider">|</span>Phase 1 · Schema 2.2
        </span>
      </footer>
      {jsonExport !== null && (
        <div className="modal-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            className="modal"
          >
            <h2 id="export-title">Xuất bài giảng JSON</h2>
            {jsonMediaWarning(state.project) && (
              <p role="alert">{jsonMediaWarning(state.project)}</p>
            )}
            <p>
              Tệp chứa nội dung đang chỉnh sửa. Bạn cũng có thể chọn toàn bộ văn
              bản bên dưới để sao chép và lưu thành tệp .json.
            </p>
            <label className="field">
              <span>Nội dung JSON xuất</span>
              <textarea
                readOnly
                value={jsonExport}
                rows={10}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <div className="modal-actions">
              <button autoFocus onClick={() => setJsonExport(null)}>
                Đóng
              </button>
              <button
                className="primary"
                onClick={() => downloadProjectJSON(stateRef.current.project)}
              >
                Tải tệp JSON
              </button>
            </div>
          </section>
        </div>
      )}
      {showMedia && !preview && (
        <MediaPanel
          project={state.project}
          initialSlideId={state.selectedId}
          close={() => setShowMedia(false)}
          attach={(id, asset, caption) =>
            dispatch({ type: "attach-media", id, asset, caption })
          }
        />
      )}
      {showAi && !preview && (
        <AiStudio
          project={state.project}
          media={localMediaStore}
          apply={(project) => dispatch({ type: "ai", project })}
          onClose={() => setShowAi(false)}
        />
      )}
      {showQuality && !preview && (
        <QualityPanel
          project={state.project}
          close={() => setShowQuality(false)}
          navigate={(id) => dispatch({ type: "select", id })}
          apply={(proposal) => {
            try {
              applyProposal(stateRef.current.project, proposal);
              dispatch({ type: "quality", proposal });
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Hãy phân tích lại trang trước khi áp dụng.",
              );
            }
          }}
        />
      )}
      {deleteTarget && (
        <div className="modal-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="modal"
          >
            <div className="modal-icon danger-text">
              <Trash2 size={25} />
            </div>
            <h2 id="delete-title">Xóa trang này?</h2>
            <p>
              Trang “
              {state.project.slides.find((s) => s.id === deleteTarget)?.title}”
              sẽ bị xóa khỏi bài giảng. Thao tác này không thể hoàn tác.
            </p>
            <div className="modal-actions">
              <button autoFocus onClick={() => setDeleteTarget(null)}>
                Giữ lại trang
              </button>
              <button
                className="danger"
                onClick={() => {
                  dispatch({ type: "delete", id: deleteTarget });
                  setDeleteTarget(null);
                }}
              >
                Xóa trang
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
