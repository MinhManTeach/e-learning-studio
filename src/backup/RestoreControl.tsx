import { useEffect, useRef, useState } from "react";
import type { LessonProject } from "../model/schema";
import type { ProjectStore } from "../storage/projects";
import { localMediaStore } from "../media/storage";
import { inspectBackup, type InspectedBackup } from "./package";
import { restoreBackup } from "./restore";
import { backupLimits } from "./zip";
import "./backup.css";
export function RestoreControl({
  store,
  open,
}: {
  store: ProjectStore;
  open: (project: LessonProject) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null),
    [summary, setSummary] = useState<InspectedBackup | null>(null);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [conflict, setConflict] = useState(false),
    [restored, setRestored] = useState<LessonProject | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!summary) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, [summary]);
  async function inspect(selected: File) {
    setBusy(true);
    setError("");
    setStatus("Đang kiểm tra tệp sao lưu…");
    setRestored(null);
    setBytes(null);
    try {
      if (selected.size > backupLimits.archive)
        throw new Error("Tệp sao lưu vượt 80 MB.");
      const data = new Uint8Array(await selected.arrayBuffer()),
        validated = await inspectBackup(data);
      const existing = (await store.list()).projects;
      setConflict(
        existing.some((p) => p.projectId === validated.project.projectId),
      );
      setBytes(data);
      setSummary(validated);
      setStatus("");
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "Không đọc được tệp sao lưu.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmRestore() {
    if (!bytes) return;
    setBusy(true);
    setError("");
    try {
      const project = await restoreBackup(
        bytes,
        store,
        localMediaStore,
        setStatus,
      );
      setRestored(project);
      setSummary(null);
      setBytes(null);
      setStatus("Khôi phục thành công");
    } catch (e) {
      setStatus("");
      setError(
        e instanceof Error
          ? e.message
          : "Khôi phục thất bại. Bài gốc được giữ nguyên.",
      );
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    if (busy) return;
    setSummary(null);
    setBytes(null);
    setStatus("");
  }
  return (
    <div className="restore-control">
      <button disabled={busy} onClick={() => file.current?.click()}>
        Khôi phục bài giảng
      </button>
      <input
        ref={file}
        type="file"
        aria-label="Tệp sao lưu bài giảng ZIP"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = "";
          if (selected) void inspect(selected);
        }}
      />
      {status && <p role="status">{status}</p>}
      {!summary && error && <p role="alert">{error}</p>}
      {restored && (
        <button className="primary" onClick={() => open(restored)}>
          Mở bài giảng đã khôi phục
        </button>
      )}
      {summary && (
        <dialog
          ref={dialog}
          className="restore-dialog"
          aria-labelledby="restore-title"
          onCancel={(e) => {
            e.preventDefault();
            cancel();
          }}
        >
          <h2 id="restore-title">Khôi phục thành bản sao</h2>
          <p>
            <strong>
              {summary.project.metadata.projectTitle ||
                "Bài giảng chưa đặt tên"}
            </strong>
          </p>
          <p>
            {summary.project.slides.length} trang · {summary.media.length} hình
            ảnh · {summary.project.metadata.durationMinutes} phút
          </p>
          {summary.manifest.unattachedSuggestions.length > 0 && (
            <p>
              {summary.manifest.unattachedSuggestions.length} gợi ý học liệu
              chưa gắn ảnh được giữ dưới dạng gợi ý; không phải tệp ảnh bị
              thiếu.
            </p>
          )}
          <p>
            {conflict ? "Bài giảng này đã có trên thiết bị. " : ""}Bản sao sẽ có
            mã riêng; bài gốc và hình ảnh hiện có được giữ nguyên.
          </p>
          <p>
            Tệp đã được kiểm tra cấu trúc, dữ liệu bài giảng và hình ảnh. Không
            nhập tiến độ học sinh hay cấu hình AI.
          </p>
          {status && <p role="status">{status}</p>}
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button disabled={busy} onClick={cancel}>
              Hủy
            </button>
            <button
              className="primary"
              disabled={busy || !store.saveNew}
              onClick={() => void confirmRestore()}
            >
              {busy ? "Đang khôi phục…" : "Khôi phục thành bản sao"}
            </button>
          </div>
          {!store.saveNew && (
            <p role="alert">
              Kho dự phòng chưa hỗ trợ khôi phục an toàn. Hãy cho phép IndexedDB
              rồi tải lại ứng dụng.
            </p>
          )}
        </dialog>
      )}
    </div>
  );
}
