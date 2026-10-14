import { AccountBar } from "./account/AccountBar";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardPaste,
  Clock3,
  FileUp,
  FolderOpen,
  GraduationCap,
  PackageCheck,
  Pencil,
  Presentation,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Sparkles,
} from "lucide-react";
import { createProject } from "./model/factories";
import { importProjectJSON } from "./model/json";
import { createSampleProject } from "./fixtures/sampleLesson";
import type { LessonProject } from "./model/schema";
import { findProject, type ProjectStore } from "./storage/projects";
import { localMediaStore, type LocalMediaAssetStore } from "./media/storage";
import { Field } from "./editor/Fields";
import { RestoreControl } from "./backup/RestoreControl";
import { PptxImport, type MediaWriter } from "./import/pptx/PptxImport";
export function Dashboard({
  store,
  open,
  startImport,
  media = localMediaStore,
  mediaWriter = localMediaStore,
}: {
  store: ProjectStore;
  open: (project: LessonProject) => void;
  startImport: (mode: "paste" | "file") => void;
  media?: Pick<LocalMediaAssetStore, "removeProject">;
  mediaWriter?: MediaWriter;
}) {
  const [pptxOpen, setPptxOpen] = useState(false);
  const [projects, setProjects] = useState<LessonProject[]>([]);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [newProject, setNewProject] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LessonProject | null>(null);
  const file = useRef<HTMLInputElement>(null);
  async function refresh() {
    try {
      const result = await store.list();
      setProjects(result.projects);
      setWarning(
        result.invalidCount
          ? `${result.invalidCount} bài giảng không đọc được. Dữ liệu gốc vẫn được giữ lại trên thiết bị.`
          : "",
      );
    } catch {
      setError(
        "Không mở được kho bài giảng. Hãy tải lại trang hoặc kiểm tra quyền lưu dữ liệu của trình duyệt.",
      );
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function create() {
    setBusy(true);
    setError("");
    const project = createProject(title.trim() || "Bài giảng mới");
    try {
      await store.save(project);
      open(project);
    } catch {
      setError(
        "Chưa tạo được bài giảng. Hãy kiểm tra dung lượng lưu trữ và thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importFile(selected: File) {
    setError("");
    try {
      if (selected.size > 10 * 1024 * 1024) throw new Error("too large");
      const project = importProjectJSON(await selected.text());
      const existing = await findProject(store, project.projectId);
      if (
        existing &&
        !confirm(
          "Bài giảng này đã có trên thiết bị. Thay thế bằng nội dung trong tệp?",
        )
      )
        return;
      await store.save(project);
      open(project);
    } catch {
      setError(
        "Không đọc được tệp bài giảng. Hãy chọn tệp bài giảng hợp lệ, dung lượng dưới 10 MB.",
      );
    }
  }
  return (
    <div className="dashboard">
      {pptxOpen && (
        <PptxImport
          store={store}
          media={mediaWriter}
          open={(project) => {
            setPptxOpen(false);
            open(project);
          }}
          onClose={() => setPptxOpen(false)}
        />
      )}
      <header className="dashboard-header">
        <a className="brand" href="/" title="Về trang chủ lopso.vn">
          <span className="brand-icon">
            <GraduationCap size={26} />
          </span>
          <span className="brand-text">
            <span>
              E-Learning<span className="brand-light"> Studio</span>
            </span>
            <small>Không gian soạn bài của thầy cô</small>
          </span>
        </a>
        <AccountBar />
      </header>
      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div className="hero-copy">
            <span className="hero-pill">
              <Sparkles size={15} /> Dành cho thầy cô
            </span>
            <h1>
              Biến bài dạy thành <mark>bài học sinh động</mark>
            </h1>
            <p>
              Nhập PowerPoint hoặc kế hoạch bài dạy. Thầy cô sửa, xem trước rồi
              xuất gói SCORM để đưa lên LMS của trường.
            </p>
            <div className="start-options">
              <button
                className="start-option featured"
                onClick={() => setPptxOpen(true)}
              >
                <span className="start-icon">
                  <Presentation size={22} />
                </span>
                <span className="start-text">
                  <strong>Nhập PowerPoint</strong>
                  <small>Giữ hình slide, video và câu hỏi</small>
                </span>
                <ArrowRight className="start-arrow" size={18} />
              </button>
              <button
                className="start-option"
                onClick={() => startImport("file")}
              >
                <span className="start-icon sky">
                  <FileUp size={22} />
                </span>
                <span className="start-text">
                  <strong>Nhập tệp kế hoạch</strong>
                  <small>Giáo án Word (.docx) hoặc .txt</small>
                </span>
                <ArrowRight className="start-arrow" size={18} />
              </button>
              <button
                className="start-option"
                onClick={() => startImport("paste")}
              >
                <span className="start-icon sun">
                  <ClipboardPaste size={22} />
                </span>
                <span className="start-text">
                  <strong>Dán nội dung kế hoạch</strong>
                  <small>Chép từ giáo án có sẵn</small>
                </span>
                <ArrowRight className="start-arrow" size={18} />
              </button>
            </div>
            <div className="hero-foot">
              <button
                className="manual-entry"
                onClick={() => setNewProject(true)}
              >
                <Plus size={15} />
                Tạo bài thủ công
              </button>
              <span>Thầy cô kiểm tra mọi nội dung trước khi dùng.</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-blob" />
            <div className="art-slide">
              <div className="art-slide-top">
                <span />
                <span />
                <span />
              </div>
              <div className="art-slide-body">
                <span className="art-chip">Câu 3/10</span>
                <strong>Em chọn đáp án đúng</strong>
                <div className="art-answers">
                  <span>A</span>
                  <span className="right">
                    B <Check size={14} />
                  </span>
                  <span>C</span>
                  <span>D</span>
                </div>
                <div className="art-progress">
                  <span />
                </div>
              </div>
            </div>
            <div className="art-badge praise">
              <Star size={16} /> Giỏi quá!
            </div>
            <div className="art-badge scorm">
              <Check size={16} /> SCORM · LMS
            </div>
          </div>
        </section>
        <ol className="steps-strip">
          <li>
            <span className="step-icon">
              <FileUp size={19} />
            </span>
            <span>
              <strong>Nhập bài</strong>
              <small>PowerPoint hoặc giáo án</small>
            </span>
          </li>
          <li>
            <span className="step-icon sky">
              <Pencil size={19} />
            </span>
            <span>
              <strong>Sửa và xem trước</strong>
              <small>Như học sinh nhìn thấy</small>
            </span>
          </li>
          <li>
            <span className="step-icon sun">
              <PackageCheck size={19} />
            </span>
            <span>
              <strong>Xuất gói SCORM</strong>
              <small>Tải lên LMS của trường</small>
            </span>
          </li>
        </ol>
        <section className="projects-section">
          <div className="projects-heading">
            <h2>
              Bài giảng của tôi <span>{projects.length}</span>
            </h2>
            <div className="projects-actions">
              <button onClick={() => file.current?.click()}>
                <FolderOpen size={17} /> Mở tệp bài giảng
              </button>
              <RestoreControl store={store} open={open} />
              <button
                onClick={async () => {
                  try {
                    const sample = createSampleProject();
                    sample.projectId = crypto.randomUUID();
                    await store.save(sample);
                    open(sample);
                  } catch {
                    setError("Chưa mở được bài mẫu. Hãy thử lại.");
                  }
                }}
              >
                <BookOpen size={17} /> Xem bài mẫu
              </button>
            </div>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void importFile(selected);
                e.target.value = "";
              }}
            />
          </div>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {warning && (
            <p className="callout" role="status">
              {warning}
            </p>
          )}
          <div className="project-grid">
            <button
              className="new-project-card"
              onClick={() => setPptxOpen(true)}
            >
              <span>
                <Plus size={26} />
              </span>
              <strong>Bài giảng mới</strong>
              <p>Bắt đầu từ PowerPoint của thầy cô.</p>
            </button>
            {projects.map((project, index) => (
              <article key={project.projectId} className="project-card">
                <button className="project-open" onClick={() => open(project)}>
                  <div className={`project-cover tone-${index % 4}`}>
                    <span>{project.metadata.subject || "Bài giảng"}</span>
                    <BookOpen size={34} />
                    <strong>{project.metadata.projectTitle}</strong>
                  </div>
                  <div className="project-card-body">
                    <h3>{project.metadata.projectTitle}</h3>
                    <p>
                      {project.metadata.targetAudienceGrade
                        ? `Lớp ${project.metadata.targetAudienceGrade.replace(/^Lớp\s*/i, "")} · `
                        : ""}
                      {project.slides.length} trang
                    </p>
                    <span>
                      <Clock3 size={13} /> Sửa ngày{" "}
                      {new Date(project.updatedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                </button>
                <button
                  className="delete-project"
                  aria-label={"Xóa bài giảng " + project.metadata.projectTitle}
                  onClick={() => setDeleteTarget(project)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
        <p className="dashboard-note">
          <ShieldCheck size={16} /> Bài giảng được lưu trong trình duyệt trên
          thiết bị này. Hãy dùng cùng trình duyệt để mở lại, và sao lưu bài
          thường xuyên.
        </p>
      </main>
      <footer className="dashboard-footer">
        <span>
          © 2026 E-Learning Studio · Đồng hành cùng thầy cô, khơi mở từng bài
          học.
        </span>
        <nav aria-label="Pháp lý">
          <a href="/">Trang chủ lopso.vn</a>
          <a href="/dieu-khoan">Điều khoản sử dụng</a>
          <a href="/chinh-sach-bao-mat">Chính sách bảo mật</a>
          <a href="mailto:minhmanteach@gmail.com">Liên hệ</a>
        </nav>
      </footer>
      {newProject && (
        <div className="modal-overlay">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="modal-icon">
              <BookOpen size={27} />
            </div>
            <h2 id="new-title">Một bài học mới bắt đầu</h2>
            <p>Đặt tên cho bài giảng. Bạn có thể đổi tên bất cứ lúc nào.</p>
            <Field label="Tên bài giảng" value={title} onChange={setTitle} />
            <p className="hint">
              Sẵn sàng với trang mở đầu và một trang nội dung.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setNewProject(false)}>
                Để sau
              </button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Đang tạo…" : "Tạo bài giảng"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <h2 id="delete-project-title">Xóa bài giảng?</h2>
            <p>
              “{deleteTarget.metadata.projectTitle}” và tất cả các trang sẽ bị
              xóa khỏi thiết bị này. Thao tác này không thể hoàn tác.
            </p>
            <div className="modal-actions">
              <button autoFocus onClick={() => setDeleteTarget(null)}>
                Giữ lại
              </button>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await store.remove(deleteTarget.projectId);
                    // Leftover images only waste space; never fail the delete over them.
                    await media
                      .removeProject(deleteTarget.projectId)
                      .catch(() => {});
                    setDeleteTarget(null);
                    await refresh();
                  } catch {
                    setError("Chưa xóa được bài giảng. Hãy thử lại.");
                  }
                }}
              >
                Xóa bài giảng
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
