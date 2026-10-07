import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createProject } from "../src/model/factoriesV21";
import {
  decodeProject,
  decodeStoredProject,
  migrateV20,
} from "../src/model/migrations";
import { parseProject } from "../src/model/schema";
import { LocalProjectStore, openIndexedStore } from "../src/storage/projects";
import template from "../examples/lesson-2.1.json";

function oldProject() {
  const p = createProject("Bài đã lưu từ Phase 0");
  const { durationMinutes: _duration, ...metadata } = p.metadata;
  const {
    aiIntegration: _ai,
    specialNeeds: _needs,
    ...objectives
  } = p.objectives;
  return {
    schemaVersion: "2.0",
    projectId: p.projectId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    metadata: {
      ...metadata,
      duration: "35 phút (1 tiết học)",
      objectives: { ...objectives, knowledge: ["Kiến thức cũ"] },
      aiIntegration: "Nội dung AI cũ",
      specialNeeds: "Hỗ trợ cũ",
    },
    settings: { theme: "studio", passingScore: 70 },
    slides: [...p.slides].reverse(),
    assets: [
      { id: "asset-1", name: "Ảnh cũ", url: "https://example.com/image.png" },
    ],
    legacySource: { version: "1.2.0", notes: "nguồn gốc" },
  };
}
describe("Schema 2.1 migration and import", () => {
  it("accepts the exact supplied template with generated identity, title and timestamps", () => {
    const p = decodeProject(template);
    expect(p.schemaVersion).toBe("2.2");
    expect(p.projectId).toBeTruthy();
    expect(p.createdAt).toBe(p.updatedAt);
    expect(p.metadata.projectTitle).toBe(template.metadata.topic);
    expect(p.metadata.durationMinutes).toBe(35);
    expect(p.objectives).toMatchObject(template.objectives);
    expect(p.settings).toEqual(template.settings);
    expect(p.slides).toEqual([]);
    expect(parseProject(p)).toEqual(p);
  });
  it("creates separate identities for repeated template imports", () => {
    expect(decodeProject(template).projectId).not.toBe(
      decodeProject(template).projectId,
    );
  });
  it("requires identity for stored records instead of recreating corrupt records", () => {
    expect(() => decodeStoredProject(template)).toThrow();
  });
  it("migrates 2.0 preserving identity, dates, slide order, assets and every old source field", () => {
    const old = oldProject();
    const p = migrateV20(old);
    expect(p.projectId).toBe(old.projectId);
    expect(p.createdAt).toBe(old.createdAt);
    expect(p.updatedAt).toBe(old.updatedAt);
    expect(p.slides.map((s) => s.id)).toEqual(old.slides.map((s) => s.id));
    p.slides.forEach((s, i) => {
      expect(s.title).toBe(old.slides[i].title);
      expect(s.voiceScript).toBe(old.slides[i].voiceScript);
    });
    expect(p.assets).toMatchObject(old.assets);
    expect(p.legacySource).toEqual(old.legacySource);
    expect(p.migrationSource).toEqual(old);
    expect(p.metadata.durationMinutes).toBe(35);
    expect(p.objectives.knowledge).toEqual(["Kiến thức cũ"]);
    expect(p.objectives.aiIntegration.description).toBe("Nội dung AI cũ");
    expect(p.objectives.specialNeeds).toBe("Hỗ trợ cũ");
    expect(p.settings.passingScore).toBe(70);
    expect(p.settings.theme).toBe("SAFE_TEAL");
    expect(decodeStoredProject(p)).toEqual(p);
  });
  it("retains unrecognized duration text in migration source", () => {
    const old = oldProject();
    old.metadata.duration = "Một buổi học";
    const p = migrateV20(old);
    expect(p.metadata.durationMinutes).toBe(0);
    expect(p.migrationSource).toEqual(old);
  });
  it("rejects malformed legacy data rather than accepting a partial project", () => {
    const old = oldProject();
    old.slides[1].id = old.slides[0].id;
    expect(() => migrateV20(old)).toThrow();
    expect(() => migrateV20({ ...oldProject(), projectId: "" })).toThrow();
  });
  it.each([-1, 1.5, "35 phút", null])(
    "rejects invalid duration %j",
    (durationMinutes) => {
      expect(() =>
        decodeProject({
          ...template,
          metadata: { ...template.metadata, durationMinutes },
        }),
      ).toThrow();
    },
  );
  it.each([
    { theme: "unknown" },
    { aspectRatio: "4:3" },
    { passingScore: 101 },
    { requireQuiz: "true" },
    { allowRetry: 0 },
    { requireAllSlides: null },
  ])("rejects malformed settings %j", (patch) => {
    expect(() =>
      decodeProject({
        ...template,
        settings: { ...template.settings, ...patch },
      }),
    ).toThrow();
  });
  it("preserves explicit false flags and nondefault passing score through save/load", async () => {
    const p = decodeProject({
      ...template,
      settings: {
        ...template.settings,
        requireQuiz: false,
        requireAllSlides: false,
        allowRetry: false,
        passingScore: 65,
      },
    });
    const store = await openIndexedStore(new IDBFactory());
    await store.save(p);
    expect((await store.list()).projects).toEqual([p]);
  });
  it("loads and upgrades real 2.0 IndexedDB records, writing current schema only on save", async () => {
    const factory = new IDBFactory();
    const store = await openIndexedStore(factory);
    const old = oldProject();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open("elearning-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    async function rawRead() {
      return new Promise<unknown>((resolve, reject) => {
        const request = db
          .transaction("projects")
          .objectStore("projects")
          .get(old.projectId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(old);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const loaded = await store.list();
    expect(loaded.invalidCount).toBe(0);
    expect(loaded.projects[0]).toEqual(migrateV20(old));
    expect(await rawRead()).toEqual(old);
    await store.save(loaded.projects[0]);
    expect(await rawRead()).toEqual(loaded.projects[0]);
    db.close();
  });
  it("loads a 2.0 localStorage record without overwriting the source until save", async () => {
    const old = oldProject();
    const values = new Map([
      [`elearning.project.${old.projectId}`, JSON.stringify(old)],
    ]);
    const storage: Storage = {
      get length() {
        return values.size;
      },
      key: (i) => [...values.keys()][i] ?? null,
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => {
        values.set(k, v);
      },
      removeItem: (k) => {
        values.delete(k);
      },
      clear: () => values.clear(),
    };
    const store = new LocalProjectStore(storage);
    const result = await store.list();
    expect(result.invalidCount).toBe(0);
    expect(result.projects[0]).toEqual(migrateV20(old));
    expect(JSON.parse(values.values().next().value!)).toEqual(old);
    await store.save(result.projects[0]);
    expect((await store.list()).projects).toEqual(result.projects);
  });
});
