import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  LocalProjectStore,
  ProjectConflictError,
  findProject,
  openIndexedStore,
} from "../src/storage/projects";
import { createProject } from "../src/model/factories";
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}
describe.each(["indexed", "local"])("%s project persistence", (backend) => {
  async function setup() {
    return backend === "indexed"
      ? openIndexedStore(new IDBFactory())
      : new LocalProjectStore(memoryStorage());
  }
  it("saves and loads metadata, slide content and exact ordering", async () => {
    const store = await setup();
    const p = createProject("Tin học lớp 4 – Thông tin trên Website");
    p.metadata.subject = "Tin học";
    p.metadata.grade = "4";
    p.metadata.durationMinutes = 35;
    p.slides.reverse();
    await store.save(p);
    expect((await store.list()).projects).toEqual([p]);
  });
  it("updates the same project without duplicates", async () => {
    const store = await setup();
    const p = createProject();
    await store.save(p);
    p.metadata.topic = "Thông tin trên Website";
    await store.save(p);
    expect((await store.list()).projects).toEqual([p]);
  });
  it("deletes only the selected project", async () => {
    const store = await setup();
    const a = createProject();
    const b = createProject();
    await store.save(a);
    await store.save(b);
    await store.remove(a.projectId);
    expect((await store.list()).projects).toEqual([b]);
  });
  it("rejects malformed projects before writing", async () => {
    const store = await setup();
    const p = createProject();
    p.projectId = "";
    await expect(store.save(p)).rejects.toThrow();
    expect((await store.list()).projects).toHaveLength(0);
  });
});
it("keeps corrupt local data and lists valid projects", async () => {
  const storage = memoryStorage();
  storage.setItem("elearning.project.broken", "{bad");
  storage.setItem("elearning.project.future", '{"schemaVersion":"3.0"}');
  const store = new LocalProjectStore(storage);
  const p = createProject();
  await store.save(p);
  expect(await store.list()).toEqual({ projects: [p], invalidCount: 2 });
  expect(storage.getItem("elearning.project.broken")).toBe("{bad");
});
it("propagates quota errors instead of claiming save success", async () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new DOMException("full", "QuotaExceededError");
  };
  await expect(
    new LocalProjectStore(storage).save(createProject()),
  ).rejects.toThrow("full");
});
describe.each(["indexed", "local"])("%s conflict detection", (backend) => {
  async function twoTabs() {
    if (backend === "indexed") {
      const factory = new IDBFactory();
      return [await openIndexedStore(factory), await openIndexedStore(factory)];
    }
    const storage = memoryStorage();
    return [new LocalProjectStore(storage), new LocalProjectStore(storage)];
  }
  const later = (p: { updatedAt: string }, ms: number) =>
    new Date(Date.parse(p.updatedAt) + ms).toISOString();
  it("rejects a stale save from another tab and keeps the newer copy", async () => {
    const [tabA, tabB] = await twoTabs();
    const opened = createProject("Bài chung");
    await tabA.save(opened);
    const fromA = { ...opened, updatedAt: later(opened, 1000) };
    fromA.metadata = { ...opened.metadata, topic: "Sửa ở tab A" };
    await tabA.save(fromA, { expectedUpdatedAt: opened.updatedAt });
    const fromB = { ...opened, updatedAt: later(opened, 2000) };
    fromB.metadata = { ...opened.metadata, topic: "Sửa ở tab B" };
    await expect(
      tabB.save(fromB, { expectedUpdatedAt: opened.updatedAt }),
    ).rejects.toBeInstanceOf(ProjectConflictError);
    expect((await tabB.list()).projects[0].metadata.topic).toBe("Sửa ở tab A");
  });
  it("accepts consecutive saves from the same tab and saves without a baseline", async () => {
    const [tab] = await twoTabs();
    const p = createProject();
    await tab.save(p);
    const next = { ...p, updatedAt: later(p, 1000) };
    await tab.save(next, { expectedUpdatedAt: p.updatedAt });
    const third = { ...next, updatedAt: later(p, 2000) };
    await tab.save(third, { expectedUpdatedAt: next.updatedAt });
    await tab.save({ ...third, updatedAt: later(p, 3000) });
    expect((await tab.list()).projects).toHaveLength(1);
  });
});
describe.each(["indexed", "local"])("%s single-project lookup", (backend) => {
  async function setup() {
    return backend === "indexed"
      ? openIndexedStore(new IDBFactory())
      : new LocalProjectStore(memoryStorage());
  }
  it("finds one project by ID without listing the store", async () => {
    const store = await setup();
    const a = createProject("Bài A");
    const b = createProject("Bài B");
    await store.save(a);
    await store.save(b);
    const list = vi.spyOn(store, "list");
    expect(await findProject(store, b.projectId)).toEqual(b);
    expect(list).not.toHaveBeenCalled();
    // A miss may scan on the localStorage fallback to keep list() semantics.
    expect(await findProject(store, "missing")).toBeUndefined();
  });
});
it("falls back to list() for stores without get()", async () => {
  const p = createProject();
  const store = {
    list: async () => ({ projects: [p], invalidCount: 0 }),
    save: async () => {},
    remove: async () => {},
  };
  expect(await findProject(store, p.projectId)).toEqual(p);
  expect(await findProject(store, "missing")).toBeUndefined();
});
describe("localStorage lookup keeps list() semantics", () => {
  it("matches by projectId, not by storage key", async () => {
    const storage = memoryStorage();
    const b = createProject("Bài B");
    // A valid record for project B stored under another project's key.
    storage.setItem("elearning.project.A", JSON.stringify(b));
    const store = new LocalProjectStore(storage);
    expect(await findProject(store, "A")).toBeUndefined();
    expect(await findProject(store, b.projectId)).toEqual(b);
  });
  it("treats an unreadable entry like list() does instead of rejecting", async () => {
    const storage = memoryStorage();
    const p = createProject();
    storage.setItem("elearning.project." + p.projectId, JSON.stringify(p));
    const getItem = storage.getItem;
    storage.getItem = (key) => {
      if (key === "elearning.project.broken") throw new Error("read failed");
      return getItem(key);
    };
    storage.setItem("elearning.project.broken", "{}");
    const store = new LocalProjectStore(storage);
    await expect(findProject(store, "broken")).resolves.toBeUndefined();
    expect(await findProject(store, p.projectId)).toEqual(p);
  });
});
