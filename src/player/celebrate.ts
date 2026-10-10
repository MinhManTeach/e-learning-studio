// A child's success (or a gentle "thử lại") as a window event, so renderers stay
// free of player details. The exported player shows "Giỏi quá!" with confetti
// and a short sound; the editor preview simply ignores it.
export type CelebrationKind = "right" | "retry";
export const celebrationEvent = "lesson-celebrate";

export function celebrate(kind: CelebrationKind) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(celebrationEvent, { detail: kind }));
}

/** A tiny chime made in the browser (no sound files): rising for right, soft for retry. */
export function playChime(kind: CelebrationKind) {
  const Ctx =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const notes = kind === "right" ? [523.25, 659.25, 783.99] : [392, 329.63];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.12;
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Sound is a bonus; never block the lesson.
  }
}
