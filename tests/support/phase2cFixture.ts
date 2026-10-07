import { readFileSync } from "node:fs";
import { DeterministicLessonAnalysisProvider } from "../../src/import/analyzer";
import { importPastedPlan } from "../../src/import/documents";
import { DeterministicLessonBlueprintProvider } from "../../src/blueprint/generator";
import {
  createBlueprintDraft,
  approveBlueprint,
} from "../../src/blueprint/draft";
import { outcomeCatalog } from "../../src/blueprint/model";
import type { LessonGenerationContext } from "../../src/generation/model";
export async function generationFixture() {
  const a = await new DeterministicLessonAnalysisProvider().analyze(
    importPastedPlan(readFileSync("src/fixtures/lesson-plan-vi.txt", "utf8")),
  );
  const b = await new DeterministicLessonBlueprintProvider().generate(a);
  const draft = approveBlueprint(createBlueprintDraft(b), a);
  const context: LessonGenerationContext = {
    projectId: "generated-test",
    now: "2026-10-08T00:00:00.000Z",
    outcomes: outcomeCatalog(a),
  };
  return { a, b, draft, context };
}
