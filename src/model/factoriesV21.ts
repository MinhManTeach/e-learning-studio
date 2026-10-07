import {
  metadataSchema,
  objectivesSchema,
  settingsSchema,
  type LessonProject,
  type BasicSlide,
  type SlideType,
} from "./schemaV21";
export function createSlide(type: SlideType): BasicSlide {
  return {
    id: crypto.randomUUID(),
    type,
    stepNumber: 1,
    stepName: "",
    title: type === "welcome" ? "Trang mở đầu" : "Nội dung bài học",
    subtitle: "",
    voiceScript: "",
    notes: "",
    data: {
      body: "",
      bulletPoints: [],
      keyTakeaway: "",
      imageUrl: "",
      imageCaption: "",
    },
  };
}
export function createProject(projectTitle = "Bài giảng mới"): LessonProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: "2.1",
    projectId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    metadata: metadataSchema.parse({ projectTitle }),
    objectives: objectivesSchema.parse({}),
    settings: settingsSchema.parse({}),
    slides: [createSlide("welcome"), createSlide("content")],
    assets: [],
  };
}
