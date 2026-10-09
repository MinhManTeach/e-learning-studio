import { useEffect, useState } from "react";
import { Dashboard } from "./Dashboard";
import { Editor } from "./editor/Editor";
import type { LessonProject } from "./model/schema";
import {
  findProject,
  openProjectStore,
  type ProjectStore,
} from "./storage/projects";
import { LessonImportWizard } from "./import/LessonImportWizard";
import { AiSettings } from "./import/AiSettings";
import {
  localAiService,
  readLocalAiStatus,
  type LocalConnectionStatus,
} from "./import/localAiConnection";
export function App() {
  const [aiStatus, setAiStatus] = useState<LocalConnectionStatus>({
    providerId: "openai",
    model: "",
    configured: false,
    status: "NOT_CONNECTED",
  });
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiService] = useState(localAiService);
  async function refreshAi() {
    setAiStatus(await readLocalAiStatus());
  }
  useEffect(() => {
    void refreshAi();
  }, []);
  const [storage, setStorage] = useState<{
    store: ProjectStore;
    fallback: boolean;
  } | null>(null);
  const [project, setProject] = useState<LessonProject | null>(null);
  const [initialPreview, setInitialPreview] = useState(false);
  const [openError, setOpenError] = useState("");
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
      {openError && (
        <div role="alert">
          {openError}
          <button onClick={() => setOpenError("")}>Đóng</button>
        </div>
      )}
      {!project && !importMode && (
        <button
          className="ai-settings-button"
          onClick={() => setAiSettingsOpen(true)}
        >
          Cài đặt · AI hỗ trợ
        </button>
      )}
      {aiSettingsOpen && (
        <AiSettings
          status={aiStatus}
          refresh={() => void refreshAi()}
          close={() => setAiSettingsOpen(false)}
        />
      )}
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
        service={aiStatus.configured ? aiService : undefined}
        aiConfigured={aiStatus.configured}
        store={storage.store}
        openGenerated={(generated, preview) => {
          void findProject(storage.store, generated.projectId)
            .then((saved) => {
              if (!saved)
                throw new Error(
                  "Bài giảng không còn trong kho. Hãy tạo lại từ kịch bản đã duyệt.",
                );
              setOpenError("");
              setInitialPreview(preview);
              setProject(saved);
              setImportMode(null);
            })
            .catch(() =>
              setOpenError(
                "Chưa mở được bài giảng đã lưu. Hãy kiểm tra kho bài giảng rồi thử lại.",
              ),
            );
        }}
      />
      {importMode ? null : project ? (
        <Editor
          key={project.projectId}
          project={project}
          store={storage.store}
          initialPreview={initialPreview}
          back={() => setProject(null)}
        />
      ) : (
        <Dashboard
          store={storage.store}
          open={(p) => {
            setInitialPreview(false);
            setProject(p);
          }}
          startImport={setImportMode}
        />
      )}
    </>
  );
}
