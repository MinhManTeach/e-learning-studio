import { createSlide } from "../model/factories";
import { attachMedia } from "../media/service";
import type { AssetReference } from "../model/schema";
import type {
  LessonProject,
  Metadata,
  Objectives,
  Slide,
  SlideType,
} from "../model/schema";
export interface EditorState {
  project: LessonProject;
  selectedId: string | null;
  revision: number;
}
export type EditorAction =
  | { type: "select"; id: string | null }
  | { type: "metadata"; metadata: Metadata }
  | { type: "objectives"; objectives: Objectives }
  | { type: "settings"; settings: LessonProject["settings"] }
  | { type: "media"; id: string; url: string; alt: string }
  | { type: "attach-media"; id: string; asset: AssetReference; caption: string }
  | { type: "add"; slideType: SlideType }
  | { type: "edit"; slide: Slide }
  | { type: "duplicate"; id: string }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; direction: -1 | 1 };
export function editorState(project: LessonProject): EditorState {
  return { project, selectedId: project.slides[0]?.id ?? null, revision: 0 };
}
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  const project = state.project;
  let selectedId = state.selectedId;
  let slides = project.slides;
  let metadata = project.metadata;
  let objectives = project.objectives;
  let settings = project.settings;
  let assets = project.assets;
  if (action.type === "select")
    return {
      ...state,
      selectedId:
        action.id === null || slides.some((s) => s.id === action.id)
          ? action.id
          : selectedId,
    };
  switch (action.type) {
    case "attach-media": {
      const attached = attachMedia(
        project,
        action.id,
        action.asset,
        action.caption,
      );
      slides = attached.slides;
      assets = attached.assets;
      break;
    }
    case "settings":
      settings = action.settings;
      break;
    case "media": {
      const slide = slides.find((s) => s.id === action.id);
      if (!slide) return state;
      const existing = assets.find((a) => a.id === slide.media.assetId);
      const shared =
        existing &&
        slides.some(
          (s) => s.id !== slide.id && s.media.assetId === existing.id,
        );
      const asset =
        existing?.status === "LOCAL" && existing.url === action.url
          ? { ...existing, altText: action.alt }
          : {
              id: existing && !shared ? existing.id : crypto.randomUUID(),
              kind: "IMAGE" as const,
              sourceType: "URL" as const,
              name: existing?.name ?? "",
              fileName: "",
              mimeType: "",
              url: action.url,
              altText: action.alt,
              status: "EXTERNAL" as const,
            };
      assets = assets.some((a) => a.id === asset.id)
        ? assets.map((a) => (a.id === asset.id ? asset : a))
        : [...assets, asset];
      slides = slides.map((s) =>
        s.id === slide.id
          ? {
              ...s,
              media: {
                ...s.media,
                assetId: asset.id,
                enabled:
                  existing?.url === action.url ? s.media.enabled : !!action.url,
              },
            }
          : s,
      );
      break;
    }
    case "objectives":
      objectives = action.objectives;
      break;
    case "metadata":
      metadata = action.metadata;
      break;
    case "add": {
      const slide = createSlide(action.slideType);
      slides = [...slides, slide];
      selectedId = slide.id;
      break;
    }
    case "edit": {
      if (!slides.some((s) => s.id === action.slide.id)) return state;
      slides = slides.map((s) => (s.id === action.slide.id ? action.slide : s));
      break;
    }
    case "duplicate": {
      const index = slides.findIndex((s) => s.id === action.id);
      if (index < 0) return state;
      const slide = {
        ...structuredClone(slides[index]),
        id: crypto.randomUUID(),
        title: slides[index].title + " (bản sao)",
      };
      slides = [
        ...slides.slice(0, index + 1),
        slide,
        ...slides.slice(index + 1),
      ];
      selectedId = slide.id;
      break;
    }
    case "delete": {
      const index = slides.findIndex((s) => s.id === action.id);
      if (index < 0) return state;
      slides = slides.filter((s) => s.id !== action.id);
      if (selectedId === action.id)
        selectedId = slides[Math.min(index, slides.length - 1)]?.id ?? null;
      break;
    }
    case "move": {
      const index = slides.findIndex((s) => s.id === action.id);
      const target = index + action.direction;
      if (index < 0 || target < 0 || target >= slides.length) return state;
      slides = [...slides];
      [slides[index], slides[target]] = [slides[target], slides[index]];
      break;
    }
  }
  return {
    project: {
      ...project,
      slides,
      metadata,
      objectives,
      settings,
      assets,
      updatedAt: new Date().toISOString(),
    },
    selectedId,
    revision: state.revision + 1,
  };
}
