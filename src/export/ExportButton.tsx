import { useEffect, useState } from "react";
import type { LessonProject } from "../model/schema";
import { localMediaStore } from "../media/storage";
import {
  buildLessonPackage,
  exportIssues,
  scormVersions,
  type ExportMediaReader,
  type PlayerAssets,
  type ScormVersion,
} from "./package";

async function loadPlayer(): Promise<PlayerAssets> {
  const m = await import("virtual:lesson-player");
  return { js: m.playerJs, css: m.playerCss };
}
const megabytes = (n: number) =>
  (n / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

const scormLabels: Record<ScormVersion, string> = {
  "1.2": "SCORM 1.2",
  "2004": "SCORM 2004",
};
// A teacher's LMS takes one standard; remember it so the next export matches.
const choiceKey = "elearning-studio:scorm-version";
function savedChoice(): ScormVersion {
  try {
    const v = localStorage.getItem(choiceKey);
    return v === "2004" ? "2004" : "1.2";
  } catch {
    return "1.2";
  }
}
function saveChoice(v: ScormVersion) {
  try {
    localStorage.setItem(choiceKey, v);
  } catch {
    // Storage blocked: the choice just is not remembered.
  }
}

/** Builds a SCORM 1.2 or 2004 ZIP that also runs offline from index.html. */
export function ExportButton({
  project,
  media = localMediaStore,
  player = loadPlayer,
}: {
  project: LessonProject;
  media?: ExportMediaReader;
  player?: () => Promise<PlayerAssets>;
}) {
  const [busy, setBusy] = useState(false);
  const [scorm, setScorm] = useState<ScormVersion>(savedChoice);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [download, setDownload] = useState<{
    url: string;
    name: string;
    size: number;
    scorm: ScormVersion;
  } | null>(null);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  async function run() {
    setBusy(true);
    setError("");
    setDownload(null);
    setWarnings(
      exportIssues(project)
        .filter((x) => x.level === "WARN")
        .map((x) => x.message),
    );
    try {
      const pkg = await buildLessonPackage(project, media, await player(), {
        scorm,
      });
      setDownload({
        url: URL.createObjectURL(
          new Blob([new Uint8Array(pkg.bytes).buffer], {
            type: "application/zip",
          }),
        ),
        name: pkg.fileName,
        size: pkg.bytes.length,
        scorm: pkg.scorm,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Chưa tạo được gói bài giảng. Bài giảng vẫn được giữ nguyên.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="backup-control export-control">
      <label className="scorm-choice">
        Chuẩn{" "}
        <select
          value={scorm}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value as ScormVersion;
            setScorm(v);
            saveChoice(v);
            setDownload(null);
          }}
        >
          {scormVersions.map((v) => (
            <option key={v} value={v}>
              {scormLabels[v]}
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy} onClick={() => void run()}>
        {busy ? "Đang tạo gói…" : "Xuất gói SCORM"}
      </button>
      {download && (
        <a href={download.url} download={download.name}>
          Tải gói {scormLabels[download.scorm]} / HTML5 (
          {megabytes(download.size)} MB)
        </a>
      )}
      {download && (
        <span className="hint" role="status">
          Tải nguyên tệp ZIP lên LMS, hoặc giải nén rồi mở index.html để học
          không cần mạng.
        </span>
      )}
      {warnings.map((w) => (
        <span key={w} className="hint export-warning">
          {w}
        </span>
      ))}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
