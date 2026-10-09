import { expect, it } from "vitest";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { createBackup, inspectBackup, sha256 } from "../src/backup/package";
import { readBackupZip, backupLimits } from "../src/backup/zip";
import { createProject } from "../src/model/factories";
const emptyMedia = { get: async () => undefined };
async function validFiles() {
  return unzipSync(await createBackup(createProject(), emptyMedia));
}
const pack = (files: Record<string, Uint8Array>) =>
  zipSync(files, { level: 0 });
it.each([
  "../bad.png",
  "/absolute.png",
  "C:\\bad.png",
  "assets/../0001.png",
  "assets/nested/x.png",
  "evil.svg",
  "assets/0001.svg",
])("rejects unsafe or unexpected entry %s", (name) => {
  expect(() =>
    readBackupZip(
      pack({
        "manifest.json": strToU8("{}"),
        "project.json": strToU8("{}"),
        [name]: strToU8("bad"),
      }),
    ),
  ).toThrow();
});
it("rejects duplicate ZIP names before object-based extraction could collapse them", async () => {
  const bytes = pack({
    "manifest.json": strToU8("{}"),
    "project.json": strToU8("{}"),
    "pr0ject.json": strToU8("{}"),
  });
  const needle = strToU8("pr0ject.json");
  for (let i = 0; i < bytes.length - needle.length; i++)
    if (needle.every((b, j) => bytes[i + j] === b)) bytes[i + 2] = 111;
  expect(() => readBackupZip(bytes)).toThrow();
});
it.each([new Uint8Array(), new Uint8Array([80, 75, 3, 4]), new Uint8Array(30)])(
  "rejects corrupt archives",
  async (bytes) => {
    await expect(inspectBackup(bytes)).rejects.toThrow();
  },
);
it("rejects CRC corruption, oversized archive and compressed bombs without inflation", async () => {
  const files = await validFiles();
  const corrupt = pack(files);
  corrupt[45] ^= 1;
  expect(() => readBackupZip(corrupt)).toThrow();
  expect(() =>
    readBackupZip(new Uint8Array(backupLimits.archive + 1)),
  ).toThrow();
  const bomb = zipSync(
    {
      "manifest.json": new Uint8Array(3 * 1024 * 1024),
      "project.json": strToU8("{}"),
    },
    { level: 9 },
  );
  expect(() => readBackupZip(bomb)).toThrow();
});
it("rejects forged expanded sizes and oversized JSON before reading payload", async () => {
  const bytes = pack(await validFiles());
  const v = new DataView(bytes.buffer);
  const start = v.getUint32(bytes.length - 6, true);
  v.setUint32(start + 24, 0xffffffff, true);
  expect(() => readBackupZip(bytes)).toThrow();
  expect(() =>
    readBackupZip(
      pack({
        "manifest.json": new Uint8Array(backupLimits.json + 1),
        "project.json": strToU8("{}"),
      }),
    ),
  ).toThrow();
});
it.each(["version", "identity", "projectChecksum", "malformed"])(
  "rejects manifest/project %s mismatch",
  async (kind) => {
    const files = await validFiles(),
      manifest = JSON.parse(strFromU8(files["manifest.json"]));
    if (kind === "version") manifest.version = 2;
    if (kind === "identity") manifest.projectId = "other";
    if (kind === "projectChecksum") manifest.project.sha256 = "0".repeat(64);
    files["manifest.json"] = strToU8(
      kind === "malformed" ? "{" : JSON.stringify(manifest),
    );
    await expect(inspectBackup(pack(files))).rejects.toThrow();
  },
);
it("does not serialize unknown credentials, temporary URLs or device paths", async () => {
  const p = createProject();
  for (const legacySource of [
    { apiKey: "sensitive" },
    { path: "C:\\Users\\teacher\\photo.png" },
    { url: "blob:temporary" },
    { password: "secret" },
    { url: "https://user:password@example.com/a" },
    { url: "https://example.com/a?token=private" },
  ]) {
    await expect(
      createBackup({ ...p, legacySource }, emptyMedia),
    ).rejects.toThrow();
  }
  const files = await validFiles();
  const raw = JSON.parse(strFromU8(files["project.json"]));
  raw.apiKey = "sensitive";
  files["project.json"] = strToU8(JSON.stringify(raw));
  const m = JSON.parse(strFromU8(files["manifest.json"]));
  m.project.size = files["project.json"].length;
  m.project.sha256 = await sha256(files["project.json"]);
  files["manifest.json"] = strToU8(JSON.stringify(m));
  await expect(inspectBackup(pack(files))).rejects.toThrow(/nhạy cảm/);
});
it.each(["encrypted", "descriptor", "localName", "symlink"])(
  "rejects unsupported ZIP %s headers",
  async (kind) => {
    const bytes = pack(await validFiles()),
      view = new DataView(bytes.buffer),
      start = view.getUint32(bytes.length - 6, true);
    if (kind === "encrypted") view.setUint16(start + 8, 1, true);
    if (kind === "descriptor") view.setUint16(start + 8, 8, true);
    if (kind === "localName") bytes[30] ^= 1;
    if (kind === "symlink") view.setUint32(start + 38, 0xa0000000, true);
    expect(() => readBackupZip(bytes)).toThrow();
  },
);
