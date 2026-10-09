import { expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createProject } from "../src/model/factories";
import { LocalMediaAssetStore } from "../src/media/storage";
import { openIndexedStore } from "../src/storage/projects";
import { createBackup } from "../src/backup/package";
import { restoreBackup } from "../src/backup/restore";
import { backupFixture } from "./fixtures/backup";
it("restores into a fresh database with new ownership and preserves stable IDs and teacher data", async () => {
  const p = createProject(),
    media = new LocalMediaAssetStore(new IDBFactory(), "source");
  const bytes = await createBackup(p, media);
  const factory = new IDBFactory(),
    store = await openIndexedStore(factory, "target"),
    targetMedia = new LocalMediaAssetStore(factory, "target-media");
  await store.save(p);
  const restored = await restoreBackup(bytes, store, targetMedia);
  expect(restored.projectId).not.toBe(p.projectId);
  expect(restored.slides).toEqual(p.slides);
  expect((await store.list()).projects).toHaveLength(2);
  expect(
    (await store.list()).projects.find((x) => x.projectId === p.projectId),
  ).toEqual(p);
});
it("restores binary ownership, teacher edits, layouts, quizzes and scenarios exactly", async () => {
  const { p, media } = await backupFixture();
  p.slides[0].subtitle = "Chỉnh sửa của giáo viên";
  p.slides[0].layout = "MEDIA_LEFT_TEXT_RIGHT";
  const bytes = await createBackup(p, media),
    factory = new IDBFactory();
  const store = await openIndexedStore(factory, "projects"),
    target = new LocalMediaAssetStore(factory, "media");
  const copy = await restoreBackup(bytes, store, target);
  expect(copy.slides).toEqual(p.slides);
  expect(copy.assets).toEqual(p.assets);
  expect(copy.settings).toEqual(p.settings);
  const binary = (await target.get("picture", copy.projectId))!;
  expect(binary.projectId).toBe(copy.projectId);
  expect(await target.get("picture", p.projectId)).toBeUndefined();
  expect(new Uint8Array(await binary.blob.arrayBuffer())).toEqual(
    new Uint8Array(
      await (await media.get("picture", p.projectId))!.blob.arrayBuffer(),
    ),
  );
  copy.slides[0].subtitle = "Sau khi khôi phục";
  await store.save(copy);
  const reopened = await openIndexedStore(factory, "projects");
  expect((await reopened.list()).projects[0]).toEqual(copy);
});
it("rolls back new binaries if project persistence fails without touching original", async () => {
  const { p, media } = await backupFixture(),
    bytes = await createBackup(p, media);
  const target = new LocalMediaAssetStore(new IDBFactory(), "rollback");
  const add = vi.spyOn(target, "addNew"),
    remove = vi.spyOn(target, "remove");
  const store = {
    list: async () => ({ projects: [p], invalidCount: 0 }),
    save: vi.fn(),
    remove: vi.fn(),
    saveNew: vi.fn().mockRejectedValue(new Error("quota")),
  };
  await expect(restoreBackup(bytes, store, target)).rejects.toThrow(/thu hồi/);
  const newId = add.mock.calls[0][0].projectId;
  expect(remove).toHaveBeenCalledWith("picture", newId);
  expect(await target.get("picture", newId)).toBeUndefined();
  expect(store.remove).not.toHaveBeenCalled();
});
it("rolls back earlier assets when a later binary insert fails", async () => {
  const { p, media } = await backupFixture();
  p.assets.push({ ...p.assets[0], id: "second", url: "local-media:second" });
  await media.put({
    ...(await media.get("picture", p.projectId))!,
    assetId: "second",
  });
  const bytes = await createBackup(p, media),
    factory = new IDBFactory(),
    store = await openIndexedStore(factory, "projects"),
    target = new LocalMediaAssetStore(factory, "media");
  const realAdd = target.addNew.bind(target);
  let calls = 0;
  vi.spyOn(target, "addNew").mockImplementation(async (item) => {
    if (++calls === 2) throw new Error("quota");
    await realAdd(item);
  });
  const remove = vi.spyOn(target, "remove");
  await expect(restoreBackup(bytes, store, target)).rejects.toThrow(/thu hồi/);
  expect((await store.list()).projects).toHaveLength(0);
  expect(remove).toHaveBeenCalledOnce();
});
it("reports cleanup failure honestly and does not save a project", async () => {
  const { p, media } = await backupFixture();
  const store = {
    list: async () => ({ projects: [], invalidCount: 0 }),
    save: vi.fn(),
    remove: vi.fn(),
    saveNew: vi.fn().mockRejectedValue(new Error("quota")),
  };
  const target = {
    addNew: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockRejectedValue(new Error("blocked")),
  };
  await expect(
    restoreBackup(await createBackup(p, media), store, target),
  ).rejects.toThrow(/ảnh chưa dùng/);
});
it("performs no writes for invalid archive or unsupported fallback store", async () => {
  const { p, media } = await backupFixture(),
    target = { addNew: vi.fn(), remove: vi.fn() };
  const store = { list: vi.fn(), save: vi.fn(), remove: vi.fn() };
  await expect(
    restoreBackup(new Uint8Array(), store, target),
  ).rejects.toThrow();
  await expect(
    restoreBackup(await createBackup(p, media), store, target),
  ).rejects.toThrow(/IndexedDB/);
  expect(target.addNew).not.toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();
});
it("insert-only storage rejects collisions without overwriting existing data", async () => {
  const { p, media } = await backupFixture(),
    original = (await media.get("picture", p.projectId))!;
  await expect(
    media.addNew({
      ...original,
      source: { ...original.source, creator: "Other" },
    }),
  ).rejects.toThrow();
  expect((await media.get("picture", p.projectId))!.source.creator).toBe(
    "Teacher",
  );
  const store = await openIndexedStore(new IDBFactory(), "insert");
  await store.save(p);
  await expect(
    store.saveNew({ ...p, metadata: { ...p.metadata, projectTitle: "Other" } }),
  ).rejects.toBeTruthy();
  expect((await store.list()).projects[0]).toEqual(p);
});
