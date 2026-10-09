import { expect, it, vi } from "vitest";
import { createProject } from "../src/model/factories";
import { OptionalAiEnhancementProvider } from "../src/quality/provider";
import { enhanceWithOpenAi } from "../server/enhancement";
const issue = {
  severity: "INFO",
  slideId: null,
  issueCode: "REVIEW",
  explanation: "Đối chiếu nguồn",
  suggestedAction: "Giáo viên duyệt",
};
it("uses honest deterministic fallback without key or AI calls when unconfigured", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ configured: false })));
  const result = await new OptionalAiEnhancementProvider(request).review(
    createProject(),
  );
  expect(result.mode).toBe("DETERMINISTIC");
  expect(result.status).toContain("chưa được cấu hình");
  expect(request).toHaveBeenCalledTimes(1);
});
it("validates AI advice, falls back on failure and never alters the input", async () => {
  const p = createProject(),
    before = JSON.stringify(p);
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response('{"configured":true}'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ issues: [issue] })));
  expect(
    (await new OptionalAiEnhancementProvider(request).review(p)).mode,
  ).toBe("AI");
  expect(JSON.stringify(p)).toBe(before);
  const bad = vi
    .fn()
    .mockResolvedValueOnce(new Response('{"configured":true}'))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ issues: [{ ...issue, slideId: "unknown" }] }),
      ),
    );
  expect((await new OptionalAiEnhancementProvider(bad).review(p)).mode).toBe(
    "DETERMINISTIC",
  );
});
it("keeps credentials on server and checks structured mocked provider output", async () => {
  const transport = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify({ issues: [issue] }) },
          },
        ],
      }),
    ),
  );
  const result = await enhanceWithOpenAi(
    {
      provider: "openai",
      model: "test-model",
      apiKey: "test-only-placeholder",
    },
    createProject(),
    undefined,
    transport,
  );
  expect(result.issues).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("test-only-placeholder");
  expect(JSON.parse(transport.mock.calls[0][1].body).store).toBe(false);
});
it("rejects unconfigured provider before transport and propagates cancellation", async () => {
  const transport = vi.fn();
  await expect(
    enhanceWithOpenAi({}, createProject(), undefined, transport),
  ).rejects.toThrow("AI_CONFIGURATION");
  expect(transport).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  const request = vi.fn().mockRejectedValue(new Error("aborted"));
  await expect(
    new OptionalAiEnhancementProvider(request).review(
      createProject(),
      controller.signal,
    ),
  ).rejects.toThrow();
});
