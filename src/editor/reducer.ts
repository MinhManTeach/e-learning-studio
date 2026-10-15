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
export interface EditorState {
  project: LessonProject;
  selectedId: string | null;
  revision: number;
  qualityUndo?: { before: LessonProject; after: string };
  /** Earlier versions of the lesson, newest last, for Hoàn tác (undo). */
  past?: LessonProject[];
  /** Versions undone, newest first, for Làm lại (redo). */
  future?: LessonProject[];
  /** The last change, so quick edits of one page (typing) undo together. */
  last?: { key: string; at: number };
}
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
  /** A page changed; `assets` are files it now uses (e.g. recorded voice). */
  | { type: "edit"; slide: Slide; assets?: AssetReference[] }
  | { type: "duplicate"; id: string }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; direction: -1 | 1 }
  | { type: "undo" }
  | { type: "redo" };
/** How many changes Hoàn tác can take back. */
const historyLimit = 100;
/** Edits of the same page closer together than this undo as one (typing). */
const typingPause = 1000;
export function editorState(project: LessonProject): EditorState {
  return { project, selectedId: project.slides[0]?.id ?? null, revision: 0 };
}
/**
 * Every change to the lesson can be taken back (Hoàn tác) and redone (Làm
 * lại), whether the teacher made it or an AI or quality fix did.
 */
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  const past = state.past ?? [];
  const future = state.future ?? [];
  if (action.type === "undo" || action.type === "redo") {
    const undo = action.type === "undo";
    const target = undo ? past.at(-1) : future[0];
    if (!target) return state;
    return {
      ...state,
      project: target,
      selectedId: changedSlide(state.project, target, state.selectedId),
      revision: state.revision + 1,
      past: undo ? past.slice(0, -1) : [...past, state.project],
      future: undo ? [state.project, ...future] : future.slice(1),
      last: undefined,
    };
  }
  const next = apply(state, action);
  // Selecting a page, or a change that changes nothing, is not a step.
  if (next.project === state.project) return next;
  const key = action.type === "edit" ? `edit:${action.slide.id}` : action.type;
  const at = Date.now();
  const together =
    action.type === "edit" &&
    state.last?.key === key &&
    at - state.last.at < typingPause;
  return {
    ...next,
    past: together ? past : [...past, state.project].slice(-historyLimit),
    future: [],
    last: { key, at },
  };
}
/** The page an undo or redo changed, so the teacher sees what came back. */
function changedSlide(
  from: LessonProject,
  to: LessonProject,
  selected: string | null,
) {
  const before = new Map(from.slides.map((s) => [s.id, JSON.stringify(s)]));
  const changed = to.slides.find((s) => before.get(s.id) !== JSON.stringify(s));
  if (changed) return changed.id;
  return to.slides.some((s) => s.id === selected)
    ? selected
    : (to.slides[0]?.id ?? null);
}
function apply(state: EditorState, action: EditorAction): EditorState {
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
    };
  }
  if (action.type === "ai") {
    const changed = { ...action.project, updatedAt: new Date().toISOString() };
    return {
      ...state,
      project: changed,
      revision: state.revision + 1,
      qualityUndo: { before: project, after: JSON.stringify(changed) },
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
      if (action.assets?.length)
        assets = [
          ...assets.filter((a) => !action.assets!.some((n) => n.id === a.id)),
          ...action.assets,
        ];
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
  };
}
