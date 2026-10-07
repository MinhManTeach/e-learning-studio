import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileUp,
  GraduationCap,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";
import { createProject } from "./model/factories";
import { importProjectJSON } from "./model/json";
import { createSampleProject } from "./fixtures/sampleLesson";
import type { LessonProject } from "./model/schema";
import type { ProjectStore } from "./storage/projects";
import { Field } from "./editor/Fields";
export function Dashboard({
  store,
  open,
}: {
  store: ProjectStore;
  open: (project: LessonProject) => void;
}) {
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
      const existing = (await store.list()).projects.find(
        (p) => p.projectId === project.projectId,
      );
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
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-icon">
            <GraduationCap size={26} />
          </span>
          <span>
            E-Learning<span className="brand-light"> Studio</span>
          </span>
        </div>
        <span className="local-badge">
          <span className="status-dot" /> Không gian cá nhân
        </span>
      </header>
      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div>
            <span className="eyebrow">
              DẠY BẰNG TÂM HUYẾT. SOẠN BẰNG CẢM HỨNG.
            </span>
            <h1>
              Mỗi bài giảng,
              <br />
              một hành trình khám phá<span>.</span>
            </h1>
            <p>
              Một không gian đơn giản để thầy cô biến kiến thức
              <br />
              thành những bài học đầy cảm hứng.
            </p>
            <button
              className="primary large"
              onClick={() => setNewProject(true)}
            >
              <Plus size={20} /> Tạo bài giảng mới
              <ArrowRight size={19} />
            </button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-circle" />
            <div className="art-note">
              <span>✦ KHÁM PHÁ KIẾN THỨC</span>
              <strong>
                Hôm nay,
                <br />
                mình học điều mới!
              </strong>
              <div className="art-line" />
              <div className="art-line short" />
              <BookOpen size={55} />
              <div className="art-dots">● ● ●</div>
            </div>
            <div className="art-label">
              <Sparkles size={18} /> Từ ý tưởng đến bài học
            </div>
            <span className="art-star">✳</span>
          </div>
        </section>
        <section className="projects-section">
          <div className="projects-heading">
            <div>
              <span className="eyebrow">KHÔNG GIAN CỦA BẠN</span>
              <h2>
                Bài giảng của tôi <span>{projects.length}</span>
              </h2>
            </div>
            <button onClick={() => file.current?.click()}>
              <FileUp size={17} /> Mở tệp bài giảng
            </button>
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
              Mở bài mẫu Phase 1
            </button>
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
              onClick={() => setNewProject(true)}
            >
              <span>
                <Plus size={27} />
              </span>
              <strong>Bắt đầu một bài học mới</strong>
              <p>Ý tưởng tiếp theo của thầy cô là gì?</p>
            </button>
            {projects.map((project) => (
              <article key={project.projectId} className="project-card">
                <button className="project-open" onClick={() => open(project)}>
                  <div className="project-cover">
                    <span>{project.metadata.subject || "BÀI GIẢNG"}</span>
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
                      <Clock3 size={13} />{" "}
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
          <span className="status-dot" /> Bài giảng được lưu trong trình duyệt
          trên thiết bị này. Hãy dùng cùng trình duyệt để mở lại.
        </p>
      </main>
      <footer className="dashboard-footer">
        <span>E-Learning Studio</span>
        <span>Đồng hành cùng thầy cô, khơi mở từng bài học.</span>
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
