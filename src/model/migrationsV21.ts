import { z } from "zod";
import { createProject, createSlide } from "./factoriesV21";
import { parseProject, type LessonProject, type Slide } from "./schemaV21";
import { projectV20Schema } from "./schemaV20";

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
      project.objectives[key] = list(objectives.data[key]);
    project.objectives.aiIntegration.description = str(
      objectives.data.aiIntegration,
    );
    project.objectives.specialNeeds = str(objectives.data.specialNeeds);
  }
  project.metadata.durationMinutes = durationToMinutes(
    str(old.metadata.duration),
  );
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
function durationToMinutes(duration: string): number {
  // Preserve complete source data alongside migration for free-text durations.
  const match = duration.match(
    /^\s*(\d+)\s*(?:phút(?:\s|$)|minutes?\b|min\b|$)/i,
  );
  return match ? Number(match[1]) : 0;
}
export function migrateV20(value: unknown): LessonProject {
  const old = projectV20Schema.parse(value);
  const { objectives, aiIntegration, specialNeeds, duration, ...metadata } =
    old.metadata;
  return parseProject({
    ...old,
    schemaVersion: "2.1",
    metadata: { ...metadata, durationMinutes: durationToMinutes(duration) },
    objectives: {
      ...objectives,
      aiIntegration: { code: "", title: "", description: aiIntegration },
      specialNeeds,
    },
    settings: { ...old.settings, theme: "SAFE_TEAL" },
    migrationSource: z.record(z.string(), z.unknown()).parse(value),
  });
}
// Stored records must have their identity. Hydration is reserved for imported templates.
export function decodeStoredProject(value: unknown): LessonProject {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === "2.0"
  )
    return migrateV20(value);
  return parseProject(value);
}
export function decodeProject(value: unknown): LessonProject {
  const raw = z.record(z.string(), z.unknown()).parse(value);
  if (raw.schemaVersion === "2.1") {
    const metadata = z.record(z.string(), z.unknown()).parse(raw.metadata);
    const now = new Date().toISOString();
    return parseProject({
      projectId: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...raw,
      metadata: {
        projectTitle: str(metadata.topic) || "Bài giảng mới",
        ...metadata,
      },
    });
  }
  if ("schemaVersion" in raw) return decodeStoredProject(raw);
  return migrateLegacy(value);
}
