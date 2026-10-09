import { lessonBlueprintSchema } from "../blueprint/model";
import type { BlueprintDraft } from "../blueprint/draft";
import { parseProject } from "../model/schema";
import type { ProjectStore } from "../storage/projects";
import type {
  GenerationResult,
  LessonGenerationContext,
  LessonGenerationProvider,
} from "./model";
import { DeterministicLessonGenerationProvider } from "./provider";
import { validateGeneratedLesson } from "./validation";
import { analyzeLessonQuality } from "../quality/analyzer";

export class LessonGenerationService {
  private jobs = new Map<string, Promise<GenerationResult>>();
  constructor(
    private readonly store: ProjectStore,
    private readonly provider: LessonGenerationProvider = new DeterministicLessonGenerationProvider(),
  ) {}
  generate(
    draft: BlueprintDraft,
    context: LessonGenerationContext,
  ): Promise<GenerationResult> {
    if (!draft.approvedAt)
      return Promise.reject(
        new Error(
          "Thầy/cô cần duyệt kịch bản hiện tại trước khi tạo bài giảng.",
        ),
      );
    const snapshot = structuredClone(draft.current);
    const key = JSON.stringify([draft.approvedAt, snapshot]);
    const existing = this.jobs.get(key);
    if (existing) return existing;
    const job = this.run(snapshot, context);
    this.jobs.set(key, job);
    void job.catch(() => {
      this.jobs.delete(key);
    });
    return job;
  }
  private async run(
    input: BlueprintDraft["current"],
    context: LessonGenerationContext,
  ): Promise<GenerationResult> {
    let rollback: (() => Promise<void>) | undefined;
    try {
      const blueprint = lessonBlueprintSchema.parse(input);
      if (
        (await this.store.list()).projects.some(
          (p) => p.projectId === context.projectId,
        )
      )
        throw new Error("Mã bài giảng đã tồn tại. Hãy tạo lại với mã mới.");
      const { prepareProject, ...providerContext } = context;
      let project = parseProject(
        await this.provider.generate(blueprint, providerContext),
      );
      const warnings = validateGeneratedLesson(project, blueprint, context);
      // Quality analysis pairs slides with blueprint entries by index; stop on
      // structural errors first so they are reported instead of crashing it.
      if (warnings.some((w) => w.severity === "ERROR"))
        throw contentCheckError();
      const quality = analyzeLessonQuality(project, {
        outcomes: context.outcomes.map((o) => o.text),
        bySlide: Object.fromEntries(
          project.slides.map((s, i) => [
            s.id,
            blueprint.proposedSlides[i].contentOutline,
          ]),
        ),
      });
      warnings.push(
        ...quality.issues.map((issue) => ({
          code: issue.issueCode,
          severity: issue.severity,
          message: issue.explanation + " " + issue.suggestedAction,
        })),
      );
      if (warnings.some((w) => w.severity === "ERROR"))
        throw contentCheckError();
      if (prepareProject) {
        const prepared = await prepareProject(project);
        rollback = prepared.rollback;
        project = parseProject(prepared.project);
      }
      await this.store.save(project);
      return { project, warnings };
    } catch (error) {
      if (rollback) await rollback();
      if (
        error instanceof Error &&
        /Mã bài giảng|chưa đạt kiểm tra/.test(error.message)
      )
        throw error;
      throw new Error(
        "Chưa thể tạo hoặc lưu bài giảng. Kịch bản hiện tại vẫn được giữ; thầy/cô có thể thử lại.",
      );
    }
  }
}
function contentCheckError() {
  return new Error(
    "Bài giảng chưa đạt kiểm tra nội dung. Thầy/cô kiểm tra kịch bản rồi thử lại.",
  );
}
