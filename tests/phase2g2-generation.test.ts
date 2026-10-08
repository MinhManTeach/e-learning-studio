import { it, expect, vi } from "vitest";
import { generationFixture } from "./support/phase2cFixture";
import { LessonGenerationService } from "../src/generation/service";
import { DeterministicLessonGenerationProvider } from "../src/generation/provider";
import { buildSemanticAnalysisInput } from "../src/import/semantic";
import { importPlanFile } from "../src/import/documents";
import { mediaDocx } from "./fixtures/docxMedia";
it("prepares local source assets before project save and keeps preparation out of the generation provider boundary", async () => {
  const { draft, context } = await generationFixture();
  const provider = new DeterministicLessonGenerationProvider();
  const generate = vi.spyOn(provider, "generate");
  const order: string[] = [];
  const prepareProject = vi.fn(async (project: any) => {
    order.push("prepare");
    return { project, rollback: vi.fn() };
  });
  const save = vi.fn(async () => {
    order.push("save");
  });
  await new LessonGenerationService(
    {
      list: async () => ({ projects: [], invalidCount: 0 }),
      save,
      remove: vi.fn(),
    },
    provider,
  ).generate(draft, { ...context, prepareProject });
  expect(order).toEqual(["prepare", "save"]);
  expect(generate.mock.calls[0][1]).not.toHaveProperty("prepareProject");
});
it("rolls back prepared binaries if project persistence fails", async () => {
  const { draft, context } = await generationFixture();
  const rollback = vi.fn(async () => {});
  await expect(
    new LessonGenerationService({
      list: async () => ({ projects: [], invalidCount: 0 }),
      save: vi.fn().mockRejectedValue(new Error("disk")),
      remove: vi.fn(),
    }).generate(draft, {
      ...context,
      prepareProject: async (project) => ({ project, rollback }),
    }),
  ).rejects.toThrow(/lưu bài/);
  expect(rollback).toHaveBeenCalledTimes(1);
});
it("does not send embedded binary data to the semantic-provider input", async () => {
  const bytes = mediaDocx();
  const document = await importPlanFile({
    name: "synthetic.docx",
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const input = buildSemanticAnalysisInput(document);
  expect(input).not.toHaveProperty("mediaAssets");
  expect(JSON.stringify(input)).not.toContain("bytes");
  expect(input.blocks.length).toBeGreaterThan(0);
});
