import { useEffect, useState } from "react";
import type { LessonProject } from "../model/schema";
import { localMediaStore } from "../media/storage";
import { createBackup } from "./package";
export function BackupButton({ project }: { project: LessonProject }) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [download, setDownload] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download);
    },
    [download],
  );
  async function backup() {
    setBusy(true);
    setError("");
    setDownload(null);
    setStatus("Đang đóng gói hình ảnh…");
    try {
      const bytes = await createBackup(project, localMediaStore, setStatus);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
      );
      setDownload(url);
      setStatus(
        "Tệp đã sẵn sàng. Chọn tải ZIP để lưu bài giảng và hình ảnh về thiết bị.",
      );
    } catch (e) {
      setStatus("");
      setError(
        e instanceof Error
          ? e.message
          : "Chưa tạo được bản sao lưu. Bài giảng vẫn được giữ nguyên.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="backup-control">
      <button disabled={busy} onClick={() => void backup()}>
        {busy ? "Đang đóng gói hình ảnh…" : "Sao lưu bài giảng"}
      </button>
      {download && (
        <a href={download} download="e-learning-backup.zip">
          Tải bản sao lưu ZIP
        </a>
      )}
      {status && (
        <span className="hint" role="status">
          {status}
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
