import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAiMiddleware } from "../server/localAiPlugin";
import {
  maxVoiceBatch,
  recordVoice,
  voiceScript,
  voiceStatus,
  type PowerShell,
} from "../server/windowsVoice";

// A minimal M4A header: size, "ftyp", brand.
const m4a = Buffer.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0,
]);
const dirOf = (script: string) => /\$Dir = '([^']*)'/.exec(script)?.[1] ?? "";

/** Pretends to be Windows: reads in.json and writes one file per text. */
function fakeWindows(code = 0) {
  const seen: { texts: string[]; dir: string }[] = [];
  const run: PowerShell = async (script) => {
    const dir = dirOf(script);
    if (!dir)
      return {
        code,
        stdout: code === 3 ? "NO_VOICE" : "VOICE=Microsoft An\r\n",
      };
    const { texts } = JSON.parse(await readFile(join(dir, "in.json"), "utf8"));
    seen.push({ texts, dir });
    if (code === 0)
      for (let i = 0; i < texts.length; i++)
        await writeFile(join(dir, `${i}.m4a`), m4a);
    return { code, stdout: "VOICE=Microsoft An\r\n" };
  };
  return { run, seen };
}

it("keeps the Vietnamese text out of the PowerShell script and quotes paths safely", () => {
  const script = voiceScript("record", "vi-VN", "C:\\Temp\\it's here");
  expect(script).toContain("$Dir = 'C:\\Temp\\it''s here'");
  expect(script).toContain("$Lang = 'vi-VN'");
  expect(script).toContain("in.json");
  // Windows PowerShell 5.1 reads -EncodedCommand fine, but keep it ASCII anyway.
  expect(/^[\x00-\x7f]*$/.test(script)).toBe(true);
});

it("says recording needs Windows on other systems", async () => {
  expect(await voiceStatus("vi-VN", fakeWindows().run, "linux")).toEqual({
    available: false,
    voice: "",
    reason: "NOT_WINDOWS",
  });
  await expect(
    recordVoice(
      { lang: "vi-VN", texts: ["a"] },
      undefined,
      fakeWindows().run,
      "darwin",
    ),
  ).rejects.toThrow("VOICE_NOT_WINDOWS");
});

it("finds the Windows Vietnamese voice, or says it is missing", async () => {
  expect(await voiceStatus("vi-VN", fakeWindows().run, "win32", true)).toEqual({
    available: true,
    voice: "Microsoft An",
  });
  expect(
    await voiceStatus("vi-VN", fakeWindows(3).run, "win32", true),
  ).toMatchObject({ available: false, reason: "NO_VOICE" });
});

it("records each text to an M4A file, in order, and cleans up", async () => {
  const { run, seen } = fakeWindows();
  const texts = ["Xin chào các em.", "Câu 1.", "Bàn phím."];
  const result = await recordVoice(
    { lang: "vi-VN", texts },
    undefined,
    run,
    "win32",
  );
  expect(result.voice).toBe("Microsoft An");
  expect(result.clips).toHaveLength(3);
  expect(Buffer.from(result.clips[0], "base64")).toEqual(m4a);
  expect(seen[0].texts).toEqual(texts);
  expect(existsSync(seen[0].dir)).toBe(false);
});

it("rejects bad requests before starting Windows", async () => {
  const { run, seen } = fakeWindows();
  for (const body of [
    {},
    { lang: "vi-VN", texts: [] },
    { lang: "vi-VN", texts: Array(maxVoiceBatch + 1).fill("a") },
    { lang: "vi; rm", texts: ["a"] },
  ])
    await expect(recordVoice(body, undefined, run, "win32")).rejects.toThrow(
      "VOICE_INPUT",
    );
  expect(seen).toHaveLength(0);
});

it("reports a missing voice or a failed recording with a code", async () => {
  await expect(
    recordVoice(
      { lang: "vi-VN", texts: ["a"] },
      undefined,
      fakeWindows(3).run,
      "win32",
    ),
  ).rejects.toThrow("VOICE_MISSING");
  await expect(
    recordVoice(
      { lang: "vi-VN", texts: ["a"] },
      undefined,
      fakeWindows(1).run,
      "win32",
    ),
  ).rejects.toThrow("VOICE_FAILED");
});

// On the teacher's Windows computer this records for real with Microsoft An.
it.skipIf(process.platform !== "win32")(
  "records a real sentence with the Windows voice",
  async () => {
    const status = await voiceStatus("vi-VN", undefined, "win32", true);
    if (!status.available) return; // no Vietnamese voice on this machine
    const { clips } = await recordVoice({
      lang: "vi-VN",
      texts: ["Xin chào các em.", "Câu 1."],
    });
    expect(clips).toHaveLength(2);
    const bytes = Buffer.from(clips[0], "base64");
    expect(bytes.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(bytes.length).toBeGreaterThan(1000);
  },
  60_000,
);

describe("voice endpoints", () => {
  const bodies: unknown[] = [];
  const server = createServer((req, res) => {
    void localAiMiddleware(
      {},
      {
        status: async () => ({ available: true, voice: "Microsoft An" }),
        record: async (body) => {
          bodies.push(body);
          if ((body as { texts: string[] }).texts[0] === "boom")
            throw new Error("VOICE_MISSING");
          return { voice: "Microsoft An", clips: ["AAAA"] };
        },
      },
    )(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  let url: string;
  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it("serve the voice status and recordings, and only error codes", async () => {
    expect(
      await (await fetch(`${url}/api/lesson-ai/voice/status`)).json(),
    ).toEqual({ available: true, voice: "Microsoft An" });
    const post = (texts: string[]) =>
      fetch(`${url}/api/lesson-ai/voice/record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "vi-VN", texts }),
      });
    const ok = await post(["Xin chào"]);
    expect(await ok.json()).toEqual({ voice: "Microsoft An", clips: ["AAAA"] });
    expect(bodies[0]).toEqual({ lang: "vi-VN", texts: ["Xin chào"] });
    const bad = await post(["boom"]);
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ error: "VOICE_MISSING" });
  });
});
