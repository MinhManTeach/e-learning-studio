import { describe, expect, it, vi } from "vitest";
import { generationFixture } from "./support/phase2cFixture";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { LessonGenerationService } from "../src/generation/service";
import type { LessonGenerationProvider } from "../src/generation/model";
import { createSlide } from "../src/model/factories";

describe("lesson generation error reporting", () => {
  it("reports a slide/blueprint mismatch as a content check failure, not a storage error", async () => {
    const { draft, context } = await generationFixture();
    const inner = new DeterministicLessonGenerationProvider();
    // A provider (for example a future AI one) that returns one slide too many.
    const provider: LessonGenerationProvider = {
      generate: async (...args) => {
        const project = await inner.generate(...args);
        return {
          ...project,
          slides: [...project.slides, createSlide("content")],
        };
      },
    };
    const save = vi.fn();
    const service = new LessonGenerationService(
      {
        list: async () => ({ projects: [], invalidCount: 0 }),
        save,
        remove: vi.fn(),
      },
      provider,
    );
    await expect(service.generate(draft, context)).rejects.toThrow(
      "Bài giảng chưa đạt kiểm tra nội dung",
    );
    expect(save).not.toHaveBeenCalled();
  });
});
