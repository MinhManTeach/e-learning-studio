import { parseProject, type LessonProject } from "../model/schema";
import { decodeStoredProject } from "../model/migrations";

export interface ProjectStore {
  list(): Promise<{ projects: LessonProject[]; invalidCount: number }>;
  save(project: LessonProject): Promise<void>;
  // Optional capability: restore requires atomic insert-only persistence.
  saveNew?(project: LessonProject): Promise<void>;
  remove(id: string): Promise<void>;
}
function validated(values: unknown[]) {
  const projects: LessonProject[] = [];
  let invalidCount = 0;
  for (const value of values) {
    try {
      projects.push(decodeStoredProject(value));
    } catch {
      invalidCount++;
    }
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projects, invalidCount };
}
export class LocalProjectStore implements ProjectStore {
  constructor(private storage: Storage) {}
  async list() {
    const values: unknown[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith("elearning.project.")) {
        try {
          values.push(JSON.parse(this.storage.getItem(key) ?? "null"));
        } catch {
          values.push(null);
        }
      }
    }
    return validated(values);
  }
  async save(project: LessonProject) {
    this.storage.setItem(
      "elearning.project." + project.projectId,
      JSON.stringify(parseProject(project)),
    );
  }
  async remove(id: string) {
    this.storage.removeItem("elearning.project." + id);
  }
}
export class IndexedProjectStore implements ProjectStore {
  constructor(private db: IDBDatabase) {}
  private request<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction("projects", mode);
      const request = operation(transaction.objectStore("projects"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Không thể hoàn tất lưu bài."));
    });
  }
  async list() {
    return validated(await this.request("readonly", (store) => store.getAll()));
  }
  async save(project: LessonProject) {
    await this.request("readwrite", (store) =>
      store.put(parseProject(project)),
    );
  }
  async saveNew(project: LessonProject) {
    await this.request("readwrite", (store) =>
      store.add(parseProject(project)),
    );
  }
  async remove(id: string) {
    await this.request("readwrite", (store) => store.delete(id));
  }
}
export function openIndexedStore(
  factory: IDBFactory,
  name = "elearning-studio",
): Promise<IndexedProjectStore> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects", { keyPath: "projectId" });
    request.onsuccess = () => resolve(new IndexedProjectStore(request.result));
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Kho bài giảng đang được mở ở cửa sổ khác."));
  });
}
export async function openProjectStore(): Promise<{
  store: ProjectStore;
  fallback: boolean;
}> {
  try {
    return { store: await openIndexedStore(indexedDB), fallback: false };
  } catch {
    const storage = localStorage;
    storage.setItem("elearning.check", "1");
    storage.removeItem("elearning.check");
    return { store: new LocalProjectStore(storage), fallback: true };
  }
}
