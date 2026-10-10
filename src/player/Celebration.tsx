import { useEffect, useState } from "react";
import { celebrationEvent, playChime, type CelebrationKind } from "./celebrate";

const cheers = ["Giỏi quá!", "Tuyệt vời!", "Chính xác!", "Xuất sắc!"];
const retries = ["Thử lại nhé!", "Gần đúng rồi!", "Cố lên nào!"];
const colours = [
  "#ff8a1f",
  "#2e9bff",
  "#22b573",
  "#8c5cf6",
  "#ff5c8a",
  "#ffc83d",
];

/** "Giỏi quá!" with confetti when a child gets something right; a gentle nudge otherwise. */
export function Celebration({ sound }: { sound: boolean }) {
  const [shown, setShown] = useState<{
    kind: CelebrationKind;
    text: string;
    key: number;
  } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = (e: Event) => {
      const kind = (e as CustomEvent<CelebrationKind>).detail;
      if (kind !== "right" && kind !== "retry") return;
      const words = kind === "right" ? cheers : retries;
      setShown({
        kind,
        text: words[Math.floor(Math.random() * words.length)],
        key: Date.now(),
      });
      if (sound) playChime(kind);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShown(null), 1700);
    };
    window.addEventListener(celebrationEvent, on);
    return () => {
      window.removeEventListener(celebrationEvent, on);
      window.clearTimeout(timer);
    };
  }, [sound]);
  if (!shown) return null;
  return (
    <div
      key={shown.key}
      className={"celebration " + shown.kind}
      role="status"
      aria-live="polite"
    >
      {shown.kind === "right" &&
        Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="confetti"
            aria-hidden="true"
            style={
              {
                left: `${(i * 37) % 100}%`,
                background: colours[i % colours.length],
                animationDelay: `${(i % 7) * 0.05}s`,
                "--drift": `${((i * 53) % 21) - 10}vw`,
                "--spin": `${360 + ((i * 97) % 360)}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      <span className="celebration-bubble">
        {shown.kind === "right" ? "🌟 " : "💪 "}
        {shown.text}
      </span>
    </div>
  );
}
