import { parseProject, type LessonProject } from "../model/schema";

/** What lesson-data.js puts on window for the packaged player. */
export interface PlayerPackageData {
  format: "E_LEARNING_STUDIO_PLAYER";
  version: 1;
  project: LessonProject;
  /** assetId -> path inside the package, e.g. "media/0001.png" */
  files: Record<string, string>;
}
export const playerDataGlobal = "__LESSON_PACKAGE__";

export function readPlayerData(value: unknown): PlayerPackageData {
  const data = value as Partial<PlayerPackageData> | undefined;
  if (data?.format !== "E_LEARNING_STUDIO_PLAYER" || data.version !== 1)
    throw new Error("Gói bài giảng không đúng định dạng hoặc thiếu dữ liệu.");
  const files: Record<string, string> = {};
  for (const [id, path] of Object.entries(data.files ?? {}))
    if (
      typeof path === "string" &&
      /^media\/(?:video-)?[0-9]{4}\.(png|jpg|webp|mp4|webm)$/.test(path)
    )
      files[id] = path;
  return {
    format: data.format,
    version: 1,
    project: parseProject(data.project),
    files,
  };
}
