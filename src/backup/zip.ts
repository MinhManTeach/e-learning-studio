// Version 1 intentionally accepts only STORE entries: no decompression or ZIP64 allocation.
export const backupLimits = {
  archive: 80 * 1024 * 1024,
  total: 72 * 1024 * 1024,
  json: 2 * 1024 * 1024,
  assets: 128,
};
const fail = () => {
  throw new Error(
    "ZIP không hợp lệ hoặc vượt giới hạn sao lưu. Chỉ nhận ZIP sao lưu phiên bản 1 không nén.",
  );
};
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function readBackupZip(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes.length > backupLimits.archive) fail();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (
    v.getUint32(end, true) !== 0x06054b50 ||
    v.getUint16(end + 20, true) !== 0 ||
    v.getUint16(end + 4, true) !== 0 ||
    v.getUint16(end + 6, true) !== 0
  )
    fail();
  const count = v.getUint16(end + 10, true),
    size = v.getUint32(end + 12, true),
    start = v.getUint32(end + 16, true);
  if (
    count !== v.getUint16(end + 8, true) ||
    count < 2 ||
    count > backupLimits.assets + 2 ||
    start + size !== end
  )
    fail();
  const result = new Map<string, Uint8Array>();
  let pos = start,
    local = 0,
    total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || v.getUint32(pos, true) !== 0x02014b50) fail();
    const flags = v.getUint16(pos + 8, true),
      method = v.getUint16(pos + 10, true);
    const crc = v.getUint32(pos + 16, true),
      packed = v.getUint32(pos + 20, true),
      expanded = v.getUint32(pos + 24, true);
    const nameLen = v.getUint16(pos + 28, true),
      extra = v.getUint16(pos + 30, true),
      comment = v.getUint16(pos + 32, true);
    if (
      method !== 0 ||
      (flags & ~0x800) !== 0 ||
      packed !== expanded ||
      !expanded ||
      extra ||
      comment ||
      v.getUint16(pos + 34, true) !== 0 ||
      v.getUint32(pos + 42, true) !== local ||
      pos + 46 + nameLen > end
    )
      fail();
    const mode = v.getUint32(pos + 38, true) >>> 16;
    if (mode & 0xf000 && (mode & 0xf000) !== 0x8000) fail(); // reject symlinks and directories
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (
      !/^(?:manifest\.json|project\.json|assets\/[0-9]{4}\.(?:png|jpg|webp))$/.test(
        name,
      ) ||
      result.has(name)
    )
      fail();
    const limit = name.endsWith(".json") ? backupLimits.json : 8 * 1024 * 1024;
    total += expanded;
    if (
      expanded > limit ||
      total > backupLimits.total ||
      local + 30 + nameLen + expanded > start ||
      v.getUint32(local, true) !== 0x04034b50 ||
      v.getUint16(local + 6, true) !== flags ||
      v.getUint16(local + 8, true) !== method ||
      v.getUint32(local + 14, true) !== crc ||
      v.getUint32(local + 18, true) !== packed ||
      v.getUint32(local + 22, true) !== expanded ||
      v.getUint16(local + 26, true) !== nameLen ||
      v.getUint16(local + 28, true) !== 0
    )
      fail();
    if (
      decoder.decode(bytes.subarray(local + 30, local + 30 + nameLen)) !== name
    )
      fail();
    const data = bytes.subarray(
      local + 30 + nameLen,
      local + 30 + nameLen + expanded,
    );
    if (crc32(data) !== crc) fail();
    result.set(name, data);
    local += 30 + nameLen + expanded;
    pos += 46 + nameLen;
  }
  if (
    pos !== end ||
    local !== start ||
    !result.has("manifest.json") ||
    !result.has("project.json")
  )
    fail();
  return result;
}
