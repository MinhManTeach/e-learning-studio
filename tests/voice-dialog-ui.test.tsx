// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createProject, createSlide } from "../src/model/factories";
import type { StoredMedia } from "../src/media/model";
import { VoiceDialog } from "../src/voice/VoiceDialog";

afterEach(cleanup);

function lesson() {
  const p = createProject("Bài 4");
  const s = createSlide("content");
  s.title = "Tư thế ngồi đúng";
  p.slides = [s, createSlide("activity")];
  return p;
}
function memoryStore() {
  const items = new Map<string, StoredMedia>();
  return {
    items,
    get: async (id: string) => items.get(id),
    put: async (v: StoredMedia) => {
      items.set(v.assetId, v);
    },
  };
}
const m4a = btoa(
  String.fromCharCode(
    0,
    0,
    0,
    24,
    0x66,
    0x74,
    0x79,
    0x70,
    0x6d,
    0x70,
    0x34,
    0x32,
  ),
);
function server(status: object) {
  return (async (url: string, init?: RequestInit) => {
    if (url.endsWith("/voice/status"))
      return new Response(JSON.stringify(status));
    const { texts } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ clips: texts.map(() => m4a) }));
  }) as unknown as typeof fetch;
}

it("records the whole lesson with the Windows voice and says when it is done", async () => {
  const store = memoryStore();
  render(
    <VoiceDialog
      project={lesson()}
      store={store}
      onClose={() => {}}
      fetcher={server({ available: true, voice: "Microsoft An" })}
    />,
  );
  const start = await screen.findByRole("button", { name: /^Thu \d+ đoạn$/ });
  expect(screen.getByText("Microsoft An")).toBeTruthy();
  fireEvent.click(start);
  expect(
    (await screen.findByText(/Đã có giọng đọc cho cả \d+ đoạn/)).textContent,
  ).toBeTruthy();
  expect(store.items.size).toBeGreaterThan(0);
  for (const v of store.items.values()) expect(v.mimeType).toBe("audio/mp4");
});

it("explains what to install when Windows has no Vietnamese voice", async () => {
  render(
    <VoiceDialog
      project={lesson()}
      store={memoryStore()}
      onClose={() => {}}
      fetcher={server({ available: false, voice: "", reason: "NO_VOICE" })}
    />,
  );
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /Thời gian và ngôn ngữ/,
  );
  expect(screen.queryByRole("button", { name: /^Thu/ })).toBeNull();
});

it("explains that recording needs the app running on Windows", async () => {
  render(
    <VoiceDialog
      project={lesson()}
      store={memoryStore()}
      onClose={() => {}}
      fetcher={server({ available: false, voice: "", reason: "NOT_WINDOWS" })}
    />,
  );
  expect((await screen.findByRole("alert")).textContent).toMatch(/Windows/);
});
