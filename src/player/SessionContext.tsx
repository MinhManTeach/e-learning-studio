import { createContext, useContext } from "react";
import type { LessonProject } from "../model/schema";
import type { LessonSessionState, SessionAction } from "./session";
export const SessionContext = createContext<{
  project: LessonProject;
  session: LessonSessionState;
  act: (a: SessionAction) => void;
  review: () => void;
  retry: () => void;
} | null>(null);
export const useLessonSession = () => useContext(SessionContext);
