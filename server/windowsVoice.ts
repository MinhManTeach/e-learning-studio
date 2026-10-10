// "Tạo giọng đọc": records lesson sentences with the Vietnamese voice that
// Windows installs with its language pack (Microsoft An). Chrome, Brave and
// Cốc Cốc cannot use that voice, so the editor records it once and the lesson
// package carries small M4A files that play in any browser. Free and offline.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export interface VoiceStatus {
  available: boolean;
  /** "Microsoft An" when available. */
  voice: string;
  reason?: "NOT_WINDOWS" | "NO_VOICE" | "FAILED";
}
export type PowerShell = (
  script: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => Promise<{ code: number; stdout: string }>;

/** Up to this many sentences per request, so the editor can show progress. */
export const maxVoiceBatch = 40;
export const voiceRequestSchema = z.object({
  lang: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  texts: z.array(z.string().min(1).max(4000)).min(1).max(maxVoiceBatch),
});

const quote = (s: string) => "'" + s.replace(/'/g, "''") + "'";
/**
 * Windows PowerShell 5.1 script (WinRT SpeechSynthesizer + MediaTranscoder).
 * Kept ASCII-only; texts travel in a UTF-8 JSON file, never on the command line.
 */
export function voiceScript(mode: "status" | "record", lang: string, dir = "") {
  return `$ErrorActionPreference = 'Stop'
$Mode = ${quote(mode)}; $Lang = ${quote(lang)}; $Dir = ${quote(dir)}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$base = $Lang.Split('-')[0]
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
  Where-Object { $_.Language.Split('-')[0] -eq $base } |
  Sort-Object { if ($_.Language -eq $Lang) { 0 } else { 1 } } |
  Select-Object -First 1
if (-not $voice) { 'NO_VOICE'; exit 3 }
'VOICE=' + $voice.DisplayName
if ($Mode -eq 'status') { exit 0 }
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime]
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTask = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
$asTaskP = $methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress\`1' } | Select-Object -First 1
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$data = [System.IO.File]::ReadAllText((Join-Path $Dir 'in.json'), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$texts = @($data.texts)
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $voice
try { $synth.Options.SpeakingRate = 0.9 } catch { }
$profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a([Windows.Media.MediaProperties.AudioEncodingQuality]::Low)
$profile.Audio.Bitrate = 32000
$profile.Audio.SampleRate = 16000
$profile.Audio.ChannelCount = 1
$folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($Dir)) ([Windows.Storage.StorageFolder])
$transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
for ($i = 0; $i -lt $texts.Count; $i++) {
  $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$texts[$i])) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $wav = Join-Path $Dir ("$i.wav")
  $in = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $fs = [System.IO.File]::Create($wav); $in.CopyTo($fs); $fs.Close(); $in.Dispose()
  $src = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($wav)) ([Windows.Storage.StorageFile])
  $dst = Await ($folder.CreateFileAsync("$i.m4a", [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $prep = Await ($transcoder.PrepareFileTranscodeAsync($src, $dst, $profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
  if (-not $prep.CanTranscode) { 'TRANSCODE_FAILED'; exit 4 }
  $job = $asTaskP.MakeGenericMethod([double]).Invoke($null, @($prep.TranscodeAsync()))
  $job.Wait(-1) | Out-Null
  'DONE=' + $i
}
`;
}

/** Runs a script with Windows PowerShell; -EncodedCommand avoids quoting trouble. */
export const windowsPowerShell: PowerShell = (script, timeoutMs, signal) =>
  new Promise((resolve) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      { windowsHide: true },
    );
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.resume();
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener("abort", stop, { once: true });
    const done = (code: number) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolve({ code, stdout });
    };
    child.on("error", () => done(-1));
    child.on("close", (code) => done(code ?? -1));
  });

let cached: VoiceStatus | null = null;
/** Whether this computer can record; asks Windows once per server start. */
export async function voiceStatus(
  lang = "vi-VN",
  run: PowerShell = windowsPowerShell,
  platform: string = process.platform,
  fresh = false,
): Promise<VoiceStatus> {
  if (platform !== "win32")
    return { available: false, voice: "", reason: "NOT_WINDOWS" };
  if (cached && !fresh) return cached;
  const { code, stdout } = await run(voiceScript("status", lang), 30_000);
  const voice = /VOICE=(.+)/.exec(stdout)?.[1]?.trim() ?? "";
  const status: VoiceStatus =
    code === 0 && voice
      ? { available: true, voice }
      : {
          available: false,
          voice: "",
          reason: code === 3 ? "NO_VOICE" : "FAILED",
        };
  if (status.available) cached = status;
  return status;
}

/** Records each text as an M4A file; results come back in the same order. */
export async function recordVoice(
  body: unknown,
  signal?: AbortSignal,
  run: PowerShell = windowsPowerShell,
  platform: string = process.platform,
): Promise<{ voice: string; clips: string[] }> {
  if (platform !== "win32") throw new Error("VOICE_NOT_WINDOWS");
  const parsed = voiceRequestSchema.safeParse(body);
  if (!parsed.success) throw new Error("VOICE_INPUT");
  const { lang, texts } = parsed.data;
  const dir = await mkdtemp(join(tmpdir(), "lesson-voice-"));
  try {
    await writeFile(join(dir, "in.json"), JSON.stringify({ texts }), "utf8");
    const { code, stdout } = await run(
      voiceScript("record", lang, dir),
      30_000 + texts.length * 8_000,
      signal,
    );
    signal?.throwIfAborted();
    if (code === 3) throw new Error("VOICE_MISSING");
    if (code !== 0) throw new Error("VOICE_FAILED");
    const clips = await Promise.all(
      texts.map(async (_, i) =>
        (await readFile(join(dir, `${i}.m4a`))).toString("base64"),
      ),
    ).catch(() => {
      throw new Error("VOICE_FAILED");
    });
    return { voice: /VOICE=(.+)/.exec(stdout)?.[1]?.trim() ?? "", clips };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
