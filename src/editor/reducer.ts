import { createSlide } from "../model/factories";
import { attachMedia } from "../media/service";
import { applyProposal, type ImprovementProposal } from "../quality/analyzer";
import type { AssetReference } from "../model/schema";
import type {
  LessonProject,
  Metadata,
  Objectives,
  Slide,
  SlideType,
} from "../model/schema";
/** Earlier and undone versions of one page, newest last. */
export interface PageHistory {
  past: Slide[];
  future: Slide[];
  /** When the last version was kept (typing in a field keeps one version). */
  at: number;
}
export interface EditorState {
  project: LessonProject;
  selectedId: string | null;
  revision: number;
  qualityUndo?: { before: LessonProject; after: string };
  /** Undo and redo, page by page. */
  history?: Record<string, PageHistory>;
}
/** How many versions of a page are kept. */
export const historyLimit = 50;
/** Changes closer together than this (typing a word) are undone together. */
const typingPause = 800;

/** Keeps `before` as the version to go back to for each page it changed. */
function remember(
  history: Record<string, PageHistory> | undefined,
  before: Slide[],
  after: Slide[],
  now = Date.now(),
) {
  const next = { ...history };
  for (const old of before) {
    const changed = after.find((s) => s.id === old.id);
    if (!changed || changed === old) continue;
    const h = next[old.id];
    // A burst of small edits (typing) is one step back.
    if (h && h.future.length === 0 && now - h.at < typingPause) {
      next[old.id] = { ...h, at: now };
      continue;
    }
    next[old.id] = {
      past: [...(h?.past ?? []), old].slice(-historyLimit),
      future: [],
      at: now,
    };
  }
  return next;
}
export const canUndo = (state: EditorState, id: string | null) =>
  !!id && !!state.history?.[id]?.past.length;
export const canRedo = (state: EditorState, id: string | null) =>
  !!id && !!state.history?.[id]?.future.length;
export type EditorAction =
  | { type: "quality"; proposal: ImprovementProposal }
  | { type: "quality-undo" }
  /** A whole-lesson change made by AI, undone with the same button as quality fixes. */
  | { type: "ai"; project: LessonProject }
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
  | { type: "move"; id: string; direction: -1 | 1 }
  /** Back to the page's previous version, or forward again. */
  | { type: "undo"; id: string }
  | { type: "redo"; id: string };
export function editorState(project: LessonProject): EditorState {
  return { project, selectedId: project.slides[0]?.id ?? null, revision: 0 };
}
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  const project = state.project;
  if (action.type === "quality") {
    const changed = {
      ...applyProposal(project, action.proposal),
      updatedAt: new Date().toISOString(),
    };
    return {
      ...state,
      project: changed,
      revision: state.revision + 1,
      qualityUndo: { before: project, after: JSON.stringify(changed) },
      history: remember(state.history, project.slides, changed.slides),
    };
  }
  if (action.type === "ai") {
    const changed = { ...action.project, updatedAt: new Date().toISOString() };
    return {
      ...state,
      project: changed,
      revision: state.revision + 1,
      qualityUndo: { before: project, after: JSON.stringify(changed) },
      history: remember(state.history, project.slides, changed.slides),
    };
  }
  if (action.type === "undo" || action.type === "redo") {
    const h = state.history?.[action.id];
    const current = project.slides.find((s) => s.id === action.id);
    const back = action.type === "undo";
    const target = back ? h?.past.at(-1) : h?.future.at(-1);
    if (!h || !current || !target) return state;
    return {
      ...state,
      project: {
        ...project,
        slides: project.slides.map((s) => (s.id === action.id ? target : s)),
        updatedAt: new Date().toISOString(),
      },
      selectedId: action.id,
      revision: state.revision + 1,
      qualityUndo: undefined,
      history: {
        ...state.history,
        [action.id]: back
          ? {
              past: h.past.slice(0, -1),
              future: [...h.future, current],
              at: 0,
            }
          : {
              past: [...h.past, current].slice(-historyLimit),
              future: h.future.slice(0, -1),
              at: 0,
            },
      },
    };
  }
  if (action.type === "quality-undo") {
    if (
      !state.qualityUndo ||
      state.qualityUndo.after !== JSON.stringify(project)
    )
      return state;
    return {
      ...state,
      project: state.qualityUndo.before,
      revision: state.revision + 1,
      qualityUndo: undefined,
      history: remember(
        state.history,
        project.slides,
        state.qualityUndo.before.slides,
      ),
    };
  }
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
    qualityUndo: undefined,
    history:
      action.type === "edit"
        ? remember(state.history, project.slides, slides)
        : action.type === "delete"
          ? Object.fromEntries(
              Object.entries(state.history ?? {}).filter(
                ([id]) => id !== action.id,
              ),
            )
          : state.history,
  };
}
