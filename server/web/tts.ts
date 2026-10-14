// Vietnamese read-aloud for the student apps: Bé Vui Học Cộng asks
// GET /api/tts?text=… for each phrase. It uses Google Cloud Text-to-Speech on
// the site's own key (GOOGLE_TTS_API_KEY); without a key, or when Google is
// out of reach, the app falls back to the browser's own voice.

/** Longest phrase read aloud; the apps only speak short sentences. */
export const TTS_MAX_CHARS = 200;
/** New (not cached) phrases sent to Google per minute, for the whole site. */
const PER_MINUTE = 60;
const CACHE_SIZE = 500;

export function createTts(
  apiKey: string | undefined,
  transport: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const cache = new Map<string, Buffer>();
  let windowStart = 0;
  let used = 0;

  /** MP3 audio for the text, or null when it cannot be made right now. */
  return async function speak(text: string): Promise<Buffer | null> {
    if (!apiKey) return null;
    const key = text.toLowerCase();
    const hit = cache.get(key);
    if (hit) return hit;
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      used = 0;
    }
    if (used >= PER_MINUTE) return null;
    used++;
    try {
      const res = await transport(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: "vi-VN", name: "vi-VN-Neural2-A" },
            audioConfig: {
              audioEncoding: "MP3",
              speakingRate: 0.9,
              pitch: 1.1,
            },
          }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!res.ok) return null;
      const { audioContent } = (await res.json()) as { audioContent?: string };
      if (!audioContent) return null;
      const audio = Buffer.from(audioContent, "base64");
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(key, audio);
      return audio;
    } catch {
      return null;
    }
  };
}
