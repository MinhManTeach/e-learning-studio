// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AiStudio } from "../src/ai/AiStudio";
import type { LessonProject } from "../src/model/schema";
import type { StoredMedia } from "../src/media/model";
import { aiLesson, aiPlan } from "./support/aiLesson";

afterEach(cleanup);
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function setup(
  answer: (path: string, body: unknown) => Response,
  configured = true,
  provider = "anthropic",
) {
  const calls: { path: string; body: unknown }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("/api/lesson-ai/studio/", "");
    if (path === "status")
      return json({
        provider,
        configured,
        model: `${provider}-test`,
        imageModel: "",
        images: false,
      });
    const body = JSON.parse(String(init?.body));
    calls.push({ path, body });
    return answer(path, body);
  }) as unknown as typeof fetch;
  const media = {
    get: async (assetId: string, projectId: string) =>
      assetId === "pic-boy"
        ? ({
            assetId,
            projectId,
            blob: new Blob([new Uint8Array([137, 80, 78, 71])], {
              type: "image/png",
            }),
            mimeType: "image/png",
            size: 4,
          } as StoredMedia)
        : undefined,
  };
  const applied: LessonProject[] = [];
  render(
    <AiStudio
      project={aiLesson()}
      media={media}
      apply={(p) => applied.push(p)}
      onClose={() => {}}
      fetcher={fetcher}
    />,
  );
  return { calls, applied };
}

it("explains how to connect a key when none is set up", async () => {
  setup(() => json({}), false);
  expect(await screen.findByText(/Chưa kết nối AI/)).toBeTruthy();
  expect(screen.getByText(/LESSON_AI_API_KEY=/)).toBeTruthy();
});

it("proposes page designs and activities in one call, lets the teacher choose, then applies them", async () => {
  const { calls, applied } = setup(() => json(aiPlan));
  expect(await screen.findByText(/Dùng khoá Claude/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
  expect(await screen.findByText("Trình bày lại 2 trang")).toBeTruthy();
  expect(screen.getByText("Thêm 3 hoạt động")).toBeTruthy();
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe("design");
  // The page picture went along with the text.
  expect((calls[0].body as { images: unknown[] }).images).toHaveLength(1);
  // Previews the teacher can judge: designs, activity items and answers.
  expect(screen.getByText("Hai cột so sánh")).toBeTruthy();
  expect(screen.getByText("1. Nháy Start")).toBeTruthy();
  expect(screen.getByText(/đáp án: Đúng/)).toBeTruthy();
  // The teacher drops the scenario.
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Thêm hoạt động Bạn An ngồi học" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Áp dụng (2 trang, 2 hoạt động)" }),
  );
  expect(
    await screen.findByText(/Đã trình bày lại 2 trang và thêm 2 hoạt động/),
  ).toBeTruthy();
  expect(applied[0].slides.map((s) => s.type)).toEqual([
    "content",
    "cards",
    "quiz",
    "cards",
    "activity",
    "quiz",
    "completion",
  ]);
});

it("keeps the lesson unchanged and says why when the AI cannot help", async () => {
  const { applied } = setup(() => json({ error: "AI_BILLING" }, 502));
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /chưa có tín dụng/,
  );
  expect(applied).toEqual([]);
});

it("says so when the AI proposes nothing usable", async () => {
  setup(() => json({ pages: [], activities: [], explanations: [] }));
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  expect(
    await screen.findByText(/chưa đề xuất được thay đổi nào/),
  ).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Áp dụng/ }).hasAttribute("disabled"),
    ).toBe(true),
  );
});
