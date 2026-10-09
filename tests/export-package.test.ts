import { expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
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
