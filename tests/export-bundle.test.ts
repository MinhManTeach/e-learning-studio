import { beforeAll, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { JSDOM } from "jsdom";
import {
  buildPlayerBundle,
  type PlayerBundle,
} from "../server/playerBundlePlugin";
import { buildLessonPackage } from "../src/export/package";
import { backupFixture } from "./fixtures/backup";

// Builds the real student player once (a few seconds), then runs an exported
// package the way an LMS would: page loads, scripts run, SCORM API is called.
let bundle: PlayerBundle;
beforeAll(async () => {
  bundle = await buildPlayerBundle(process.cwd());
}, 120_000);

it("builds one classic script that runs without ES modules", () => {
  expect(bundle.js.length).toBeGreaterThan(50_000);
  expect(bundle.js).not.toMatch(/^\s*(import|export)\s/m);
  expect(bundle.js).not.toContain("process.env.NODE_ENV");
  // Dev JSX would crash on the production React build (blank page).
  expect(bundle.js).not.toContain("jsxDEV");
  expect(bundle.css).toContain(".lesson-player");
});

async function until(ready: () => boolean) {
  for (let i = 0; i < 100 && !ready(); i++)
    await new Promise((r) => setTimeout(r, 20));
}

async function openPackage(url: string, api?: Record<string, unknown>) {
  const { p, media } = await backupFixture();
  p.metadata.projectTitle = "Bài 4. Làm việc với máy tính";
  p.slides[0].layout = "TEXT_LEFT_MEDIA_RIGHT";
  const files = unzipSync(
    (await buildLessonPackage(p, media, { js: bundle.js, css: bundle.css }))
      .bytes,
  );
  const html = strFromU8(files["index.html"]).replace(
    /<script src="[^"]+"><\/script>/g,
    "",
  );
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const win = dom.window as unknown as Window & {
    eval(code: string): unknown;
    API?: unknown;
  };
  if (api) win.API = api;
  win.eval(strFromU8(files["lesson-data.js"]));
  win.eval(strFromU8(files["player.js"]));
  await until(() => !!win.document.querySelector("article"));
  return { win, p, dom };
}

it("opens inside an LMS, starts a SCORM attempt and shows the first page", async () => {
  const values: Record<string, string> = {
    "cmi.core.lesson_status": "not attempted",
  };
  const calls: string[] = [];
  const api = {
    LMSInitialize: () => (calls.push("init"), "true"),
    LMSFinish: () => (calls.push("finish"), "true"),
    LMSGetValue: (k: string) => values[k] ?? "",
    LMSSetValue: (k: string, v: string) => ((values[k] = v), "true"),
    LMSCommit: () => (calls.push("commit"), "true"),
    LMSGetLastError: () => "0",
  };
  const { win, p, dom } = await openPackage(
    "https://lms.example/mod/scorm/sco/index.html",
    api,
  );
  expect(calls[0]).toBe("init");
  // React reports to the LMS in an effect, just after the page is drawn.
  await until(() => !!values["cmi.core.lesson_location"]);
  expect(win.document.querySelector(".player-title h1")?.textContent).toBe(
    "Bài 4. Làm việc với máy tính",
  );
  expect(win.document.querySelector("article h1")?.textContent).toBe(
    p.slides[0].title,
  );
  expect(values["cmi.core.lesson_status"]).toBe("incomplete");
  expect(values["cmi.core.lesson_location"]).toBe("1");
  expect(JSON.parse(values["cmi.suspend_data"])).toMatchObject({ v: 1, c: 0 });
  const img = win.document.querySelector("img");
  expect(img?.getAttribute("src")).toBe(
    "https://lms.example/mod/scorm/sco/media/0001.png",
  );
  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  expect(calls).toContain("finish");
}, 30_000);

it("opens straight from disk without an LMS", async () => {
  const { win } = await openPackage("file:///C:/bai-giang/index.html");
  expect(win.document.querySelector(".player-title h1")?.textContent).toBe(
    "Bài 4. Làm việc với máy tính",
  );
  expect(win.document.querySelector("img")?.getAttribute("src")).toBe(
    "file:///C:/bai-giang/media/0001.png",
  );
}, 30_000);
