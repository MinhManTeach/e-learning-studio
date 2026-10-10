import { expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { XMLValidator } from "fast-xml-parser";
import {
  buildLessonPackage,
  exportIssues,
  packageFileName,
  scormManifest,
} from "../src/export/package";
import { readPlayerData } from "../src/export/playerData";
import { backupFixture, png } from "./fixtures/backup";

const player = { js: "/* player */", css: "/* css */" };
function lessonData(files: Record<string, Uint8Array>) {
  const text = strFromU8(files["lesson-data.js"]);
  const json = text.replace(/^window\.__LESSON_PACKAGE__ = /, "").trim();
  return readPlayerData(JSON.parse(json.replace(/;$/, "")));
}

it("packages the edited lesson, its images and a SCORM 1.2 manifest in one ZIP", async () => {
  const { p, media } = await backupFixture();
  p.metadata.projectTitle = "Bài 4. Làm việc với máy tính";
  const pkg = await buildLessonPackage(p, media, player);
  const files = unzipSync(pkg.bytes);
  expect(Object.keys(files).sort()).toEqual([
    "HUONG_DAN.txt",
    "imsmanifest.xml",
    "index.html",
    "lesson-data.js",
    "media/0001.png",
    "player.css",
    "player.js",
  ]);
  expect(files["media/0001.png"]).toEqual(png);
  expect(pkg.imageCount).toBe(1);
  expect(pkg.fileName).toBe("bai-4-lam-viec-voi-may-tinh-scorm.zip");
  const data = lessonData(files);
  expect(data.files).toEqual({ picture: "media/0001.png" });
  expect(data.project.slides.map((s) => s.id)).toEqual(
    p.slides.map((s) => s.id),
  );
  const manifest = strFromU8(files["imsmanifest.xml"]);
  expect(manifest).toContain("<schemaversion>1.2</schemaversion>");
  expect(manifest).toContain('adlcp:scormtype="sco" href="index.html"');
  expect(manifest).toContain('<file href="media/0001.png"/>');
  expect(manifest).toContain("<adlcp:masteryscore>80</adlcp:masteryscore>");
  const html = strFromU8(files["index.html"]);
  expect(html).toContain('<script src="lesson-data.js"></script>');
  expect(html).not.toContain('type="module"');
});

it("does not ship the teacher's private notes or source excerpts to students", async () => {
  const { p, media } = await backupFixture();
  p.slides[0].teacherNotes = "Ghi chú riêng: gọi em Lan trả lời";
  p.slides[0].sourceContext = [];
  const data = lessonData(
    unzipSync((await buildLessonPackage(p, media, player)).bytes),
  );
  expect(JSON.stringify(data.project)).not.toContain("gọi em Lan");
  expect(data.project.slides[0].sourceContext).toBeUndefined();
});

it("stops with the page name when an image is missing on this device", async () => {
  const { p, media } = await backupFixture();
  await media.remove("picture", p.projectId);
  await expect(buildLessonPackage(p, media, player)).rejects.toThrow(
    /Thiếu ảnh “Photo” ở trang 1/,
  );
});

it("refuses an empty lesson", async () => {
  const { p, media } = await backupFixture();
  p.slides = [];
  await expect(buildLessonPackage(p, media, player)).rejects.toThrow(
    "Bài giảng chưa có trang nào.",
  );
});

it("warns that internet images need a connection but still exports them by address", async () => {
  const { p, media } = await backupFixture();
  p.assets[0] = {
    ...p.assets[0],
    status: "EXTERNAL",
    sourceType: "URL",
    url: "https://upload.wikimedia.org/x.png",
  };
  expect(exportIssues(p)).toEqual([
    expect.objectContaining({
      level: "WARN",
      message: expect.stringContaining("cần có mạng"),
    }),
  ]);
  const files = unzipSync((await buildLessonPackage(p, media, player)).bytes);
  expect(Object.keys(files).some((f) => f.startsWith("media/"))).toBe(false);
  expect(lessonData(files).project.assets[0].url).toBe(
    "https://upload.wikimedia.org/x.png",
  );
});

it("escapes the lesson title in the manifest", async () => {
  const { p } = await backupFixture();
  p.metadata.projectTitle = 'Chuột & bàn phím <Tiết 2> "ôn tập"';
  const manifest = scormManifest(p, ["index.html"]);
  expect(manifest).toContain(
    "<title>Chuột &amp; bàn phím &lt;Tiết 2&gt; &quot;ôn tập&quot;</title>",
  );
});

it("omits the mastery score when the lesson has no quiz questions", async () => {
  const { p } = await backupFixture();
  p.slides = p.slides.filter((s) => s.type !== "quiz");
  expect(scormManifest(p, ["index.html"])).not.toContain("masteryscore");
});

it("makes a safe file name from a Vietnamese title", () => {
  expect(packageFileName("Đường đi của Chuột máy tính!")).toBe(
    "duong-di-cua-chuot-may-tinh-scorm.zip",
  );
  expect(packageFileName("???")).toBe("bai-giang-scorm.zip");
});

// A tiny MP4 header: size, "ftyp", brand. Enough for byte sniffing.
const mp4 = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
]);
async function lessonWithVideo(bytes: Uint8Array | null) {
  const { p, media } = await backupFixture();
  p.slides[2] = {
    ...p.slides[2],
    media: { ...p.slides[2].media, enabled: true, assetId: "clip" },
  };
  p.assets.push({
    id: "clip",
    kind: "VIDEO",
    sourceType: "UPLOAD",
    name: "Buổi học đầu tiên của Khoa",
    fileName: "khoa.mp4",
    mimeType: "video/mp4",
    url: "local-media:clip",
    altText: "Video lớp học máy tính",
    status: "LOCAL",
  });
  const reader = {
    async get(id: string, projectId: string) {
      if (id !== "clip") return media.get(id, projectId);
      if (!bytes) return undefined;
      const stored = await media.get("picture", projectId);
      return {
        ...stored!,
        assetId: id,
        blob: new Blob([new Uint8Array(bytes)]),
      };
    },
  };
  return { p, reader };
}

it("puts lesson videos into the package next to the images", async () => {
  const { p, reader } = await lessonWithVideo(mp4);
  const pkg = await buildLessonPackage(p, reader, player);
  const files = unzipSync(pkg.bytes);
  expect(files["media/video-0001.mp4"]).toEqual(mp4);
  expect(pkg.videoCount).toBe(1);
  expect(pkg.imageCount).toBe(1);
  expect(lessonData(files).files.clip).toBe("media/video-0001.mp4");
  expect(strFromU8(files["imsmanifest.xml"])).toContain(
    '<file href="media/video-0001.mp4"/>',
  );
});

it("stops with the page name when a video is missing on this device", async () => {
  const { p, reader } = await lessonWithVideo(null);
  await expect(buildLessonPackage(p, reader, player)).rejects.toThrow(
    /Thiếu video “Buổi học đầu tiên của Khoa” ở trang 3/,
  );
});

it("refuses a file that is called a video but is not one", async () => {
  const { p, reader } = await lessonWithVideo(png);
  await expect(buildLessonPackage(p, reader, player)).rejects.toThrow(
    /không phải MP4 hoặc WebM hợp lệ/,
  );
});

// Runs in Node: under jsdom, blobs read back from fake IndexedDB lose arrayBuffer().
it("packages pictures used only on answer cards", async () => {
  const { p, media } = await backupFixture();
  p.slides[0].media = { ...p.slides[0].media, enabled: false };
  const quiz = p.slides.find((s) => s.type === "quiz")!;
  if (quiz.type !== "quiz") throw new Error("fixture");
  quiz.data.questions[0].options[0].imageAssetId = "picture";
  const zip = unzipSync(
    (await buildLessonPackage(p, media, { js: "", css: "" })).bytes,
  );
  expect(zip["media/0001.png"]).toEqual(png);
});

it("writes a well-formed SCORM 2004 4th Edition manifest", async () => {
  const { p } = await backupFixture();
  p.metadata.projectTitle = 'Chuột & bàn phím <Tiết 2> "ôn tập"';
  const manifest = scormManifest(p, ["index.html", "media/0001.png"], "2004");
  expect(XMLValidator.validate(manifest)).toBe(true);
  expect(manifest).toContain(
    "<schemaversion>2004 4th Edition</schemaversion>",
  );
  expect(manifest).toContain('xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"');
  expect(manifest).toContain('adlcp:scormType="sco" href="index.html"');
  expect(manifest).toContain('<file href="media/0001.png"/>');
  expect(manifest).toContain(
    "<title>Chuột &amp; bàn phím &lt;Tiết 2&gt; &quot;ôn tập&quot;</title>",
  );
  // The lesson itself decides completion and pass/fail.
  expect(manifest).toContain('completionSetByContent="true"');
  expect(manifest).toContain('objectiveSetByContent="true"');
  expect(manifest).not.toContain("masteryscore");
});

it("still writes the SCORM 1.2 manifest by default", async () => {
  const { p } = await backupFixture();
  const manifest = scormManifest(p, ["index.html"]);
  expect(XMLValidator.validate(manifest)).toBe(true);
  expect(manifest).toContain("<schemaversion>1.2</schemaversion>");
});

it("names SCORM 2004 packages so they are not mixed up with SCORM 1.2 ones", () => {
  expect(packageFileName("Bài 4", "2004")).toBe("bai-4-scorm2004.zip");
  expect(packageFileName("Bài 4", "1.2")).toBe("bai-4-scorm.zip");
  expect(packageFileName("???", "2004")).toBe("bai-giang-scorm2004.zip");
});

it("packages a lesson as SCORM 2004 with the same player and media", async () => {
  const { p, media } = await backupFixture();
  p.metadata.projectTitle = "Bài 4. Làm việc với máy tính";
  const pkg = await buildLessonPackage(
    p,
    media,
    { js: "/* player */", css: "/* css */" },
    { scorm: "2004" },
  );
  expect(pkg.fileName).toBe("bai-4-lam-viec-voi-may-tinh-scorm2004.zip");
  expect(pkg.scorm).toBe("2004");
  const files = unzipSync(pkg.bytes);
  expect(Object.keys(files)).toContain("media/0001.png");
  const manifest = strFromU8(files["imsmanifest.xml"]);
  expect(manifest).toContain("2004 4th Edition");
  expect(manifest).toContain('<file href="lesson-data.js"/>');
  expect(strFromU8(files["HUONG_DAN.txt"])).toContain("SCORM 2004");
});
