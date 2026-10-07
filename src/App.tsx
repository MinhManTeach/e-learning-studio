import { useEffect, useState } from "react";
import { Dashboard } from "./Dashboard";
import { Editor } from "./editor/Editor";
import type { LessonProject } from "./model/schema";
import { openProjectStore, type ProjectStore } from "./storage/projects";
import { LessonImportWizard } from "./import/LessonImportWizard";
export function App() {
  const [storage, setStorage] = useState<{
    store: ProjectStore;
    fallback: boolean;
  } | null>(null);
  const [project, setProject] = useState<LessonProject | null>(null);
  const [error, setError] = useState(false);
  const [importMode, setImportMode] = useState<"paste" | "file" | null>(null);
  useEffect(() => {
    void openProjectStore()
      .then(setStorage)
      .catch(() => setError(true));
  }, []);
  if (error)
    return (
      <div className="startup">
        <h1>Chưa thể mở kho bài giảng</h1>
        <p>
          Hãy cho phép trình duyệt lưu dữ liệu trên thiết bị rồi tải lại trang.
        </p>
        <button onClick={() => location.reload()}>Tải lại</button>
      </div>
    );
  if (!storage)
    return <div className="startup">Đang mở không gian bài giảng…</div>;
  return (
    <>
      {storage.fallback && (
        <div className="fallback-banner" role="status">
          Đang dùng bộ nhớ dự phòng của trình duyệt. Bài giảng vẫn được lưu trên
          thiết bị này.
        </div>
      )}
      <LessonImportWizard
        active={importMode !== null}
        initialMode={importMode ?? "paste"}
        onClose={() => setImportMode(null)}
      />
      {importMode ? null : project ? (
        <Editor
          key={project.projectId}
          project={project}
          store={storage.store}
          back={() => setProject(null)}
        />
      ) : (
        <Dashboard
          store={storage.store}
          open={setProject}
          startImport={setImportMode}
        />
      )}
    </>
  );
}
