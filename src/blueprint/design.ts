import type { TeachingActivity } from "../import/model";
import type { BlueprintSlide } from "./model";

export function mapActivityStage(
  a: TeachingActivity,
): BlueprintSlide["stage"] | null {
  if (a.stage) return a.stage;
  const title = a.title.toLocaleLowerCase("vi");
  if (/khởi động|mở đầu/.test(title)) return "OPENING";
  if (/khám phá|hình thành|kiến thức/.test(title)) return "DISCOVERY";
  if (/thực hành|luyện tập/.test(title)) return "PRACTICE";
  if (/kiểm tra|đánh giá|câu hỏi/.test(title)) return "ASSESSMENT";
  if (/vận dụng|ứng dụng/.test(title)) return "APPLICATION";
  return null;
}
export function concepts(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((v) => v.split(/\n|;|(?<=[.!?])\s+(?=[A-ZÀ-Ỹ])/u))
        .map((v) => v.replace(/^[-•\s]+/, "").trim())
        .filter(Boolean),
    ),
  ];
}
export function density(outline: string[], outcomeCount = 0, grade = 4) {
  const words = outline.join(" ").split(/\s+/u).filter(Boolean).length;
  const conceptCount = concepts(outline).length;
  return {
    words,
    conceptCount,
    excessive:
      outline.length > (grade <= 2 ? 2 : 3) ||
      conceptCount > 3 ||
      words > (grade <= 2 ? 55 : 85) ||
      outcomeCount > 3,
  };
}
// Split by conceptual boundaries, then clauses when one sentence is itself too dense.
// Trivial adjacent fragments share a chunk; paragraph count is never slide count.
export function contentChunks(
  values: string[],
  grade: number,
  capacity: number,
) {
  const limit = grade <= 2 ? 55 : 85;
  const units = concepts(values).flatMap((v) =>
    v.split(/\s+/u).length > limit
      ? v
          .split(/,|\s+và\s+/u)
          .map((x) => x.trim())
          .filter(Boolean)
      : [v],
  );
  const chunks: string[][] = [];
  for (const unit of units) {
    // A long unpunctuated source stays visible and is flagged for teacher review.
    const last = chunks.at(-1);
    if (
      last &&
      last.length < capacity &&
      !density([...last, unit], 0, grade).excessive
    )
      last.push(unit);
    else chunks.push([unit]);
  }
  return chunks;
}
export function allocateTime(slides: BlueprintSlide[], minutes: number) {
  const weights = slides.map((s) => {
    if (["WELCOME", "COMPLETION"].includes(s.type)) return 0.5;
    if (["OBJECTIVES", "SUMMARY"].includes(s.type)) return 1;
    return (
      (s.interactionIntent?.type !== "NONE" ? 3 : 2) +
      Math.min(2, s.contentOutline.length * 0.3)
    );
  });
  const total = weights.reduce((a, b) => a + b, 0);
  // Integer hundredths and largest remainders keep the sum exact without negative last slides.
  const ticks = Math.max(slides.length, Math.round(minutes * 100));
  const raw = weights.map((w) => (w / total) * (ticks - slides.length));
  const budgets = raw.map((n) => Math.floor(n) + 1);
  let remainder = ticks - budgets.reduce((a, b) => a + b, 0);
  const rank = raw
    .map((n, i) => ({ i, fraction: n % 1 }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (const r of rank) {
    if (remainder-- <= 0) break;
    budgets[r.i]++;
  }
  return slides.map((s, i) => ({ ...s, estimatedMinutes: budgets[i] / 100 }));
}
