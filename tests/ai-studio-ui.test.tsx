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
const png = btoa(
  String.fromCharCode(
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
  ),
);
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function setup(
  answer: (path: string, body: unknown) => Response,
  configured = true,
  provider = "gemini",
  images = true,
) {
  const calls: { path: string; body: unknown }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace("/api/lesson-ai/studio/", "");
    if (path === "status")
      return json({
        provider,
        configured,
        model: `${provider}-test`,
        imageModel: images ? "img" : "",
        images,
      });
    const body = JSON.parse(String(init?.body));
    calls.push({ path, body });
    return answer(path, body);
  }) as unknown as typeof fetch;
  const stored: StoredMedia[] = [];
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
    put: async (m: StoredMedia) => void stored.push(m),
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
  return { calls, stored, applied };
}

it("explains how to connect a key when none is set up", async () => {
  setup(() => json({}), false);
  expect(await screen.findByText(/Chưa kết nối AI/)).toBeTruthy();
  expect(screen.getByText(/LESSON_AI_PROVIDER=gemini/)).toBeTruthy();
});

it("proposes changes, lets the teacher choose, then applies them with a new picture", async () => {
  const { calls, stored, applied } = setup((path) =>
    path === "polish"
      ? json(aiPlan)
      : json({ mimeType: "image/png", data: png }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  expect(await screen.findByText("Hoạt động 1: Khởi động")).toBeTruthy();
  // The page picture went along with the text.
  const sent = calls[0].body as { images: unknown[]; slides: unknown[] };
  expect(sent.images).toHaveLength(1);
  expect(sent.slides).toHaveLength(4);
  expect(
    screen.getByText("A child's hand moving a computer mouse on a desk"),
  ).toBeTruthy();
  // The teacher keeps the cover page as it was.
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Áp dụng cho trang Trang 12" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Áp dụng 3 trang và vẽ 1 tranh/ }),
  );
  expect(
    await screen.findByText(/Đã làm đẹp 3 trang và vẽ 1 tranh/),
  ).toBeTruthy();
  expect(calls[1].path).toBe("illustrate");
  expect((calls[1].body as { prompt: string }).prompt).toContain(
    "computer mouse",
  );
  expect(stored).toHaveLength(1);
  const project = applied[0];
  expect(project.slides.map((s) => s.title)).toEqual([
    "Trang 12",
    "Hoạt động 1: Khởi động",
    "5 thao tác cơ bản với chuột",
    "Luyện tập",
    project.slides[4].title,
  ]);
  const steps = project.slides[2];
  const asset = project.assets.find((a) => a.id === steps.media.assetId);
  expect(asset).toMatchObject({
    kind: "IMAGE",
    sourceType: "GENERATED",
    status: "LOCAL",
    id: stored[0].assetId,
  });
  expect(steps.media.enabled).toBe(true);
  expect(steps.layout).toBe("TEXT_LEFT_MEDIA_RIGHT");
});

it("keeps the lesson unchanged and says why when the AI cannot help", async () => {
  const { applied } = setup(() => json({ error: "AI_RATE_LIMIT" }, 502));
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toMatch(/hết lượt dùng/);
  expect(applied).toEqual([]);
});

it("still applies the text when a picture cannot be drawn", async () => {
  const { applied } = setup((path) =>
    path === "polish" ? json(aiPlan) : json({ error: "AI_NO_IMAGE" }, 502),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: /Áp dụng 4 trang và vẽ 1 tranh/,
    }),
  );
  await waitFor(() => expect(applied).toHaveLength(1));
  expect(
    screen.getByText(/5 thao tác cơ bản với chuột: AI không vẽ được/),
  ).toBeTruthy();
  expect(applied[0].slides[2].media.enabled).toBe(false);
});

it("explains billing when the key cannot draw pictures", async () => {
  const { calls, applied } = setup((path) =>
    path === "polish" ? json(aiPlan) : json({ error: "AI_RATE_LIMIT" }, 502),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Áp dụng 4 trang/ }),
  );
  await waitFor(() => expect(applied).toHaveLength(1));
  expect(screen.getByText(/bật thanh toán \(Billing\)/)).toBeTruthy();
  expect(calls.filter((c) => c.path === "illustrate")).toHaveLength(1);
});

it("writes with Claude and offers no pictures without a Gemini key", async () => {
  const { calls, applied } = setup(
    () => json(aiPlan),
    true,
    "anthropic",
    false,
  );
  expect(await screen.findByText(/Dùng khoá Claude/)).toBeTruthy();
  expect(screen.getByText(/LESSON_AI_GEMINI_KEY/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Áp dụng 4 trang" }),
  );
  await waitFor(() => expect(applied).toHaveLength(1));
  expect(screen.queryByText(/Vẽ tranh minh hoạ/)).toBeNull();
  expect(calls.map((c) => c.path)).toEqual(["polish"]);
  expect(applied[0].slides[2].title).toBe("5 thao tác cơ bản với chuột");
});
