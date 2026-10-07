import { z } from "zod";
import { slideSchema } from "./schema";

// Frozen reader for existing projects. New writes always use the current schema.
const text = z.string().default("");
const lines = z.array(z.string()).default([]);
export const projectV20Schema = z.object({
  schemaVersion: z.literal("2.0"),
  projectId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  metadata: z.object({
    projectTitle: z.string().default("Bài giảng mới"),
    subject: text,
    grade: text,
    topic: text,
    duration: text,
    teacherName: text,
    schoolName: text,
    curriculum: text,
    objectives: z
      .object({ knowledge: lines, competencies: lines, qualities: lines })
      .default({ knowledge: [], competencies: [], qualities: [] }),
    aiIntegration: text,
    specialNeeds: text,
  }),
  settings: z
    .object({
      theme: z.literal("studio").default("studio"),
      passingScore: z.number().min(0).max(100).default(80),
    })
    .default({ theme: "studio", passingScore: 80 }),
  slides: z.array(slideSchema),
  assets: z
    .array(z.object({ id: z.string(), url: z.string(), name: text }))
    .default([]),
  legacySource: z.record(z.string(), z.unknown()).optional(),
});
