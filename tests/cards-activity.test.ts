import { expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createSlide } from "../src/model/factories";
import { parseProject } from "../src/model/schema";
import {
  allRight,
  checkMatch,
  checkOrder,
  checkSort,
  shuffled,
} from "../src/player/activity";
import { instructionalText } from "../src/generation/validation";
import { effectiveLayout } from "../src/model/analysis";
import { buildLessonPackage } from "../src/export/package";
import { availableSlideTypes } from "../src/slides/registry";
import { backupFixture } from "./fixtures/backup";

const item = (id: string, extra: object = {}) => ({
  id,
  text: id.toUpperCase(),
  match: "",
  group: 0,
  ...extra,
});

it("offers card pages and activities with sensible defaults", () => {
  expect(availableSlideTypes).toContain("cards");
  expect(availableSlideTypes).toContain("activity");
  const cards = createSlide("cards");
  expect(cards.data.style).toBe("STEPS");
  expect(cards.data.items).toHaveLength(3);
  expect(cards.data.groups).toEqual(["Nên", "Không nên"]);
  const activity = createSlide("activity");
  expect(activity.data.kind).toBe("ORDER");
  expect(activity.pedagogicalStage).toBe("PRACTICE");
  expect(activity.data.items.map((i) => i.text)).toEqual([
    "Bước thứ nhất",
    "Bước thứ hai",
    "Bước thứ ba",
  ]);
});

it("never shows an ordering activity already in order", () => {
  for (let n = 2; n <= 6; n++)
    for (const seed of ["a", "b", "slide-1", "slide-2", "x"]) {
      const items = Array.from({ length: n }, (_, i) => item(`i${i}`));
      const out = shuffled(items, seed);
      expect(out.map((x) => x.id).sort()).toEqual(
        items.map((x) => x.id).sort(),
      );
      expect(out.map((x) => x.id)).not.toEqual(items.map((x) => x.id));
      // Same seed, same order (the page does not reshuffle while the child works).
      expect(shuffled(items, seed)).toEqual(out);
    }
});

it("checks ordering, sorting and matching", () => {
  const steps = [item("start"), item("power"), item("shutdown")];
  expect(checkOrder(["start", "shutdown", "power"], steps)).toEqual([
    true,
    false,
    false,
  ]);
  expect(allRight(checkOrder(["start", "power", "shutdown"], steps))).toBe(
    true,
  );

  const cards = [item("eat", { group: 1 }), item("sit", { group: 0 })];
  expect(checkSort({ eat: 1, sit: 1 }, cards)).toEqual({
    eat: true,
    sit: false,
  });

  const pairs = [
    item("left", { match: "Nút trái" }),
    item("right", { match: "Nút phải" }),
    item("wheel", { match: "Nút cuộn" }),
  ];
  const marks = checkMatch(
    { left: "left", right: "wheel", wheel: "right" },
    pairs,
  );
  expect(marks).toEqual({ left: true, right: false, wheel: false });
  expect(allRight(marks)).toBe(false);
  // Two cards with the same answer text: either target is right.
  const same = [item("a", { match: "Đúng" }), item("b", { match: "Đúng" })];
  expect(allRight(checkMatch({ a: "b", b: "a" }, same))).toBe(true);
});

it("reads card and activity text for read-aloud and checks, and keeps their pictures in the package", async () => {
  const cards = createSlide("cards");
  cards.data.intro = "Năm thao tác với chuột";
  cards.data.items = [
    {
      id: "c1",
      title: "Di chuyển",
      text: "Thay đổi vị trí",
      group: 0,
      imageAssetId: "picture",
    },
  ];
  cards.data.keyTakeaway = "Nhẹ tay";
  expect(instructionalText(cards)).toEqual([
    "Năm thao tác với chuột",
    "Di chuyển: Thay đổi vị trí",
    "Nhẹ tay",
  ]);
  const activity = createSlide("activity");
  expect(instructionalText(activity)[0]).toBe(
    "Em hãy sắp xếp các bước theo đúng thứ tự.",
  );
  // A cover picture must not hide an activity the child has to do.
  activity.layout = "MEDIA_COVER";
  activity.media = { ...activity.media, enabled: true, assetId: "picture" };
  expect(effectiveLayout(activity, true)).toBe("MEDIA_FULL");

  const { p, media } = await backupFixture();
  p.slides[0].media = { ...p.slides[0].media, enabled: false };
  p.slides.push(cards);
  const project = parseProject(p);
  const files = unzipSync(
    (await buildLessonPackage(project, media, { js: "", css: "" })).bytes,
  );
  expect(Object.keys(files)).toContain("media/0001.png");
  expect(strFromU8(files["lesson-data.js"])).toContain('"style":"STEPS"');
});
