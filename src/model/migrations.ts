import {
  projectSchema as schema21,
  type LessonProject as Project21,
} from "./schemaV21";
import {
  decodeProject as decode21,
  decodeStoredProject as stored21,
  migrateLegacy as legacy21,
  migrateV20 as v20to21,
} from "./migrationsV21";
import {
  parseProject,
  assetSchema,
  slideSchema,
  type LessonProject,
} from "./schema";
export function migrateV21(value: unknown): LessonProject {
  const old: Project21 = schema21.parse(value);
  const assets = old.assets.map((a) =>
    assetSchema.parse({
      ...a,
      kind: "IMAGE",
      sourceType: "URL",
      altText: a.name,
    }),
  );
  const used = new Set(assets.map((a) => a.id));
  const slides = old.slides.map((s) => {
    let assetId: string | null = null;
    if (s.type !== "legacy" && s.data.imageUrl) {
      assetId = `migrated-media-${s.id}`;
      let n = 1;
      while (used.has(assetId)) assetId = `migrated-media-${s.id}-${n++}`;
      used.add(assetId);
      assets.push(
        assetSchema.parse({
          id: assetId,
          kind: "IMAGE",
          sourceType: "URL",
          url: s.data.imageUrl,
          name: s.data.imageCaption,
          altText: s.data.imageCaption,
        }),
      );
    }
    const data =
      s.type === "legacy"
        ? s.data
        : {
            body: s.data.body,
            bulletPoints: s.data.bulletPoints,
            keyTakeaway: s.data.keyTakeaway,
          };
    return slideSchema.parse({
      ...s,
      teacherNotes: s.notes,
      layout: assetId
        ? "TEXT_LEFT_MEDIA_RIGHT"
        : s.type === "welcome"
          ? "CENTERED"
          : "TEXT_ONLY",
      media: {
        enabled: !!assetId,
        assetId,
        caption: s.type === "legacy" ? "" : s.data.imageCaption,
      },
      narration: { mode: "BROWSER_TTS", text: s.voiceScript, lang: "vi-VN" },
      pedagogicalStage: s.type === "welcome" ? "OPENING" : "DISCOVERY",
      data,
    });
  });
  return parseProject({
    ...old,
    schemaVersion: "2.2",
    metadata: {
      ...old.metadata,
      curriculumGrade: old.metadata.grade,
      targetAudienceGrade: old.metadata.grade,
    },
    assets,
    slides,
  });
}
export function migrateLegacy(value: unknown) {
  return migrateV21(legacy21(value));
}
export function migrateV20(value: unknown) {
  return migrateV21(v20to21(value));
}
export function decodeStoredProject(value: unknown): LessonProject {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === "2.2"
  )
    return parseProject(value);
  return migrateV21(stored21(value));
}
export function decodeProject(value: unknown): LessonProject {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === "2.2"
  )
    return parseProject(value);
  return migrateV21(decode21(value));
}
