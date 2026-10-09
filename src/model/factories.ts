import {
  parseProject,
  type LessonProject,
  type Slide,
  type SlideType,
} from "./schema";
import { createDefaultSlide } from "../slides/defaults";
export function createSlide<T extends SlideType>(
  type: T,
): Extract<Slide, { type: T }> {
  return createDefaultSlide(type) as Extract<Slide, { type: T }>;
}
export function createProject(projectTitle = "Bài giảng mới"): LessonProject {
  const now = new Date().toISOString();
  return parseProject({
    schemaVersion: "2.2",
    projectId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    metadata: { projectTitle },
    slides: [createSlide("welcome"), createSlide("content")],
  });
}
