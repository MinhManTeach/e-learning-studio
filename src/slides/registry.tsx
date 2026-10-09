import type { ComponentType } from "react";
import type { Slide, SlideType } from "../model/schema";
import { createDefaultSlide, slideLabels } from "./defaults";
import {
  TypeSpecificEditor,
  type TypeEditorProps,
} from "../editor/TypeSpecificEditor";
import {
  TextRenderer,
  ObjectivesRenderer,
  SummaryRenderer,
  LegacyRenderer,
} from "../renderers/StaticRenderers";
import {
  WarmupRenderer,
  ScenarioRenderer,
  QuizRenderer,
  CompletionRenderer,
} from "../renderers/InteractionRenderers";
const renderers = {
  welcome: TextRenderer,
  content: TextRenderer,
  objectives: ObjectivesRenderer,
  warmup: WarmupRenderer,
  scenario: ScenarioRenderer,
  quiz: QuizRenderer,
  summary: SummaryRenderer,
  completion: CompletionRenderer,
  legacy: LegacyRenderer,
};
interface Entry {
  label: string;
  Renderer: ComponentType<{ slide: Slide }>;
  Editor: ComponentType<TypeEditorProps>;
  defaultFactory: () => Slide;
}
export const slideRegistry = Object.fromEntries(
  Object.entries(renderers).map(([key, Renderer]) => {
    const type = key as Slide["type"];
    return [
      type,
      {
        label: slideLabels[type],
        Renderer,
        Editor: TypeSpecificEditor,
        defaultFactory: () => {
          if (type === "legacy")
            throw new Error("Không tạo mới trang tham chiếu.");
          return createDefaultSlide(type);
        },
      },
    ];
  }),
) as Record<Slide["type"], Entry>;
export const availableSlideTypes = Object.keys(slideRegistry).filter(
  (x): x is SlideType => x !== "legacy",
);
export const futureSlideTypes = [
  "image",
  "audio",
  "video",
  "hyperlink_demo",
  "true_false",
  "matching",
  "drag_drop",
  "fill_blank",
  "hotspot",
  "handbook",
  "certificate",
] as const;
