import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { LocalProjectStore, openIndexedStore } from "../src/storage/projects";
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
    p.metadata.duration = "35 phút";
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
