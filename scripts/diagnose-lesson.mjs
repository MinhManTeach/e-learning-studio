import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const files = process.argv.slice(2);
if (!files.length)
  throw new Error(
    "Usage: node scripts/diagnose-lesson.mjs path/to/lesson.docx [...]",
  );
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { importPlanFile } = await server.ssrLoadModule(
    "/src/import/documents.ts",
  );
  const { DeterministicLessonAnalysisProvider } = await server.ssrLoadModule(
    "/src/import/analyzer.ts",
  );
  await mkdir("test-results/docx", { recursive: true });
  for (const path of files) {
    const bytes = await readFile(path);
    const document = await importPlanFile({
      name: basename(path),
      size: bytes.length,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    });
    const analysis = await new DeterministicLessonAnalysisProvider().analyze(
      document,
    );
    const output = resolve("test-results/docx", basename(path) + ".json");
    await writeFile(
      output,
      JSON.stringify(
        {
          sha256: createHash("sha256").update(bytes).digest("hex"),
          document,
          analysis,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        file: basename(path),
        output,
        blocks: document.blocks.length,
        tables: document.blocks.filter((b) => b.type === "TABLE").length,
        subject: analysis.subject,
        grade: analysis.curriculumGrade,
        title: analysis.lessonTitle,
        outcomes: analysis.learningOutcomes.length,
        knowledge: analysis.knowledgeObjectives.length,
        competencies: analysis.competencies.length,
        qualities: analysis.qualities.length,
        activities: analysis.teachingActivities.length,
        uncertain: analysis.classifications.filter((c) => c.needsReview).length,
      }),
    );
  }
} finally {
  await server.close();
}
