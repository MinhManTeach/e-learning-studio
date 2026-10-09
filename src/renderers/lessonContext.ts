import { createContext } from "react";
import type { LessonProject } from "../model/schema";

/** The lesson being shown, so slide parts can look up their assets. */
export const LessonProjectContext = createContext<LessonProject | null>(null);
