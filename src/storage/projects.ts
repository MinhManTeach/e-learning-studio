import { parseProject, type LessonProject } from "../model/schema";
import { decodeStoredProject } from "../model/migrations";

export interface SaveOptions {
  // updatedAt of the copy this editor last loaded or saved. When the stored copy
  // differs, another tab saved in between and the write is refused.
  expectedUpdatedAt?: string;
}
export class ProjectConflictError extends Error {
  constructor() {
    super("Bài giảng vừa được lưu ở cửa sổ khác.");
    this.name = "ProjectConflictError";
  }
}
export interface ProjectStore {
  list(): Promise<{ projects: LessonProject[]; invalidCount: number }>;
  save(project: LessonProject, options?: SaveOptions): Promise<void>;
  // Optional capability: restore requires atomic insert-only persistence.
  saveNew?(project: LessonProject): Promise<void>;
  remove(id: string): Promise<void>;
  // Optional capability: read one project without decoding the whole store.
  // Use findProject(), which falls back to list() for stores without it.
  get?(id: string): Promise<LessonProject | undefined>;
}
// Unreadable records count as absent, exactly as list() skips them.
export async function findProject(
  store: ProjectStore,
  id: string,
): Promise<LessonProject | undefined> {
  if (store.get) return store.get(id);
  return (await store.list()).projects.find((p) => p.projectId === id);
}
function storedUpdatedAt(value: unknown): string | undefined {
  return value && typeof value === "object" && "updatedAt" in value
    ? String(value.updatedAt)
    : undefined;
}
function isStale(stored: unknown, options?: SaveOptions) {
  const current = storedUpdatedAt(stored);
  return (
    options?.expectedUpdatedAt !== undefined &&
    current !== undefined &&
    current !== options.expectedUpdatedAt
  );
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
  async save(project: LessonProject, options?: SaveOptions) {
    const valid = parseProject(project);
    const key = "elearning.project." + valid.projectId;
    let stored: unknown;
    try {
      stored = JSON.parse(this.storage.getItem(key) ?? "null");
    } catch {
      stored = null;
    }
    if (isStale(stored, options)) throw new ProjectConflictError();
    this.storage.setItem(key, JSON.stringify(valid));
  }
  async get(id: string) {
    const raw = this.storage.getItem("elearning.project." + id);
    if (raw === null) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
    return validated([value]).projects[0];
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
  async save(project: LessonProject, options?: SaveOptions) {
    const valid = parseProject(project);
    // Read, compare and write in one readwrite transaction so no other tab can interleave.
    await new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction("projects", "readwrite");
      const store = transaction.objectStore("projects");
      let conflict = false;
      const current = store.get(valid.projectId);
      current.onsuccess = () => {
        if (isStale(current.result, options)) {
          conflict = true;
          transaction.abort();
        } else store.put(valid);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          conflict
            ? new ProjectConflictError()
            : (transaction.error ?? new Error("Không thể hoàn tất lưu bài.")),
        );
    });
  }
  async saveNew(project: LessonProject) {
    await this.request("readwrite", (store) =>
      store.add(parseProject(project)),
    );
  }
  async get(id: string) {
    const value = await this.request("readonly", (store) => store.get(id));
    return value === undefined ? undefined : validated([value]).projects[0];
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
