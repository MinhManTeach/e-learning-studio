import { parseProject } from "../model/schema";
import type { StoredMedia } from "../media/model";
import { findProject, type ProjectStore } from "../storage/projects";
import { inspectBackup } from "./package";
export interface BackupMediaWriter {
  addNew(value: StoredMedia): Promise<void>;
  remove(assetId: string, projectId: string): Promise<void>;
}
// Revalidate original bytes after confirmation; do not trust a mutable UI summary as persistence input.
export async function restoreBackup(
  bytes: Uint8Array,
  store: ProjectStore,
  media: BackupMediaWriter,
  progress: (text: string) => void = () => {},
) {
  const validated = await inspectBackup(bytes);
  if (!store.saveNew)
    throw new Error(
      "Khôi phục cần kho IndexedDB hỗ trợ tạo bản sao an toàn. Hãy cho phép IndexedDB rồi thử lại.",
    );
  const project = parseProject({
    ...validated.project,
    projectId: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  });
  if (await findProject(store, project.projectId))
    throw new Error("Mã bản sao bị trùng. Hãy thử khôi phục lại.");
  const added: string[] = [];
  try {
    for (const [i, item] of validated.media.entries()) {
      progress(`Đang khôi phục hình ảnh… ${i + 1}/${validated.media.length}`);
      await media.addNew({ ...item, projectId: project.projectId });
      added.push(item.assetId);
    }
    progress("Đang lưu bản sao bài giảng…");
    await store.saveNew(project);
    return project;
  } catch {
    const cleanup = await Promise.allSettled(
      added.map((id) => media.remove(id, project.projectId)),
    );
    throw new Error(
      cleanup.some((r) => r.status === "rejected")
        ? "Khôi phục thất bại. Không tạo bài giảng mới; một số ảnh chưa dùng có thể còn trong kho do lỗi dọn dẹp. Bài gốc được giữ nguyên."
        : "Khôi phục thất bại khi lưu dữ liệu. Đã thu hồi ảnh vừa nhập; bài gốc được giữ nguyên. Hãy kiểm tra dung lượng trình duyệt.",
    );
  }
}
