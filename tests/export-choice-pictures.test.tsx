// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import { parseProject, type AssetReference } from "../src/model/schema";
import { SlideCanvas } from "../src/renderers/SlideCanvas";
import {
  ImageResolverContext,
  packagedImageResolver,
} from "../src/media/imageResolver";

afterEach(cleanup);

const picture = (id: string, altText: string): AssetReference => ({
  id,
  kind: "IMAGE",
  sourceType: "UPLOAD",
  name: id,
  fileName: id + ".png",
  mimeType: "image/png",
  url: "local-media:" + id,
  altText,
  status: "LOCAL",
});
const files = {
  "pose-a": "media/0001.png",
  "pose-b": "media/0002.png",
  "pose-c": "media/0003.png",
};
const resolver = packagedImageResolver(files, "https://lms.example/sco/");

function lesson() {
  const p = createProject();
  p.assets = [
    picture("pose-a", "Bạn a ngồi sát màn hình"),
    picture("pose-b", "Bạn b cúi gập người"),
    picture("pose-c", "Bạn c ngồi thẳng lưng"),
  ];
  return p;
}

it("shows a picture on each quiz answer", () => {
  const p = lesson();
  const quiz = createSlide("quiz");
  const q = quiz.data.questions[0];
  q.prompt = "Tư thế nào sau đây là đúng khi sử dụng máy tính?";
  q.options = q.options.slice(0, 3).map((o, i) => ({
    ...o,
    text: "ABC"[i],
    imageAssetId: ["pose-a", "pose-b", "pose-c"][i],
  }));
  q.correctAnswerIndex = 2;
  p.slides = [quiz];
  render(
    <ImageResolverContext.Provider value={resolver}>
      <SlideCanvas slide={parseProject(p).slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  const radio = screen.getByRole("radio", { name: /Bạn c ngồi thẳng lưng/ });
  expect(radio).toBeTruthy();
  expect(
    screen
      .getByRole("img", { name: "Bạn c ngồi thẳng lưng" })
      .getAttribute("src"),
  ).toBe("https://lms.example/sco/media/0003.png");
});

it("shows pictures on scenario choices and warm-up cards", () => {
  const p = lesson();
  const scenario = createSlide("scenario");
  scenario.data.choices = scenario.data.choices.map((c, i) => ({
    ...c,
    imageAssetId: i === 0 ? "pose-a" : undefined,
  }));
  const warmup = createSlide("warmup");
  warmup.data.items = [
    {
      id: "m",
      label: "Màn hình",
      icon: "",
      isValid: true,
      feedback: "",
      imageAssetId: "pose-b",
    },
  ];
  p.slides = [scenario, warmup];
  const { rerender } = render(
    <ImageResolverContext.Provider value={resolver}>
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  expect(
    screen.getByRole("img", { name: "Bạn a ngồi sát màn hình" }),
  ).toBeTruthy();
  rerender(
    <ImageResolverContext.Provider value={resolver}>
      <SlideCanvas slide={p.slides[1]} project={p} />
    </ImageResolverContext.Provider>,
  );
  expect(screen.getByRole("img", { name: "Bạn b cúi gập người" })).toBeTruthy();
});

it("shows plain answers when a picture is missing from the package", () => {
  const p = lesson();
  const quiz = createSlide("quiz");
  quiz.data.questions[0].options[0].imageAssetId = "not-there";
  p.slides = [quiz];
  render(
    <ImageResolverContext.Provider value={resolver}>
      <SlideCanvas slide={p.slides[0]} project={p} />
    </ImageResolverContext.Provider>,
  );
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getAllByRole("radio")).toHaveLength(4);
});

it("keeps answer pictures when the lesson is saved and reopened", () => {
  const p = lesson();
  const quiz = createSlide("quiz");
  quiz.data.questions[0].options[1].imageAssetId = "pose-b";
  p.slides = [quiz];
  const reopened = parseProject(JSON.parse(JSON.stringify(p)));
  const s = reopened.slides[0];
  expect(s.type === "quiz" && s.data.questions[0].options[1].imageAssetId).toBe(
    "pose-b",
  );
});

it("does not draw an empty situation box when a scenario has no situation text", () => {
  const p = lesson();
  const scenario = createSlide("scenario");
  scenario.data.situation = "";
  p.slides = [scenario];
  const { container, rerender } = render(
    <SlideCanvas slide={p.slides[0]} project={p} />,
  );
  expect(container.querySelector(".scenario-situation")).toBeNull();
  scenario.data.situation = "Ba bạn đang ngồi trong phòng máy.";
  rerender(<SlideCanvas slide={scenario} project={p} />);
  expect(container.querySelector(".scenario-situation")?.textContent).toBe(
    "Ba bạn đang ngồi trong phòng máy.",
  );
});
