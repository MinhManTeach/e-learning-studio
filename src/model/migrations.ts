import { z } from "zod";
import { createProject, createSlide } from "./factories";
import { parseProject, type LessonProject, type Slide } from "./schema";

const legacySchema = z
  .object({
    version: z.string().regex(/^1\./),
    metadata: z.record(z.string(), z.unknown()),
    slides: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export function migrateLegacy(value: unknown): LessonProject {
  const old = legacySchema.parse(value);
  const project = createProject(
    str(old.metadata.topic) || "Bài giảng tham chiếu",
  );
  for (const key of [
    "subject",
    "grade",
    "topic",
    "duration",
    "teacherName",
    "schoolName",
    "curriculum",
  ] as const)
    project.metadata[key] = str(old.metadata[key]);
  const objectives = z
    .record(z.string(), z.unknown())
    .safeParse(old.metadata.objectives);
  if (objectives.success) {
    for (const key of ["knowledge", "competencies", "qualities"] as const)
      project.metadata.objectives[key] = list(objectives.data[key]);
    project.metadata.aiIntegration = str(objectives.data.aiIntegration);
    project.metadata.specialNeeds = str(objectives.data.specialNeeds);
  }
  const ids = new Set<string>();
  project.slides = old.slides.map((raw) => {
    const id =
      str(raw.id) && !ids.has(str(raw.id)) ? str(raw.id) : crypto.randomUUID();
    ids.add(id);
    const common = {
      id,
      title: str(raw.title),
      subtitle: str(raw.subtitle),
      stepName: str(raw.stepName),
      stepNumber:
        typeof raw.stepNumber === "number" &&
        Number.isInteger(raw.stepNumber) &&
        raw.stepNumber >= 0
          ? raw.stepNumber
          : 1,
      voiceScript: str(raw.voiceScript),
      notes: str(raw.notes),
    };
    if (raw.type === "welcome" || raw.type === "content")
      return {
        ...createSlide(raw.type),
        ...common,
        data: {
          body: "",
          bulletPoints: list(raw.bulletPoints),
          keyTakeaway: str(raw.keyTakeaway),
          imageUrl:
            raw.hasMedia && raw.mediaType === "image" ? str(raw.mediaUrl) : "",
          imageCaption: str(raw.mediaCaption),
        },
      };
    return {
      ...common,
      type: "legacy",
      data: { originalType: str(raw.type) || "unknown", original: raw },
    } satisfies Slide;
  });
  project.legacySource = old;
  return parseProject(project);
}
// Version dispatch stays outside UI and can gain ordered migrations in later phases.
export function decodeProject(value: unknown): LessonProject {
  if (typeof value === "object" && value !== null && "schemaVersion" in value)
    return parseProject(value);
  return migrateLegacy(value);
}
