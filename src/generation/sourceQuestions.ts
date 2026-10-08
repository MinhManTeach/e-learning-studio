import type { Assessment } from "../import/assessmentModel";
import type { Question } from "../model/schema";
const normalized = (s: string) =>
  s.normalize("NFC").trim().toLocaleLowerCase("vi");
// Only single-answer interactions exist in schema 2.2. Ambiguous keys stay in review.
export function sourceQuestion(q: Assessment, prefix: string): Question | null {
  if (
    q.reviewStatus !== "READY" ||
    !q.answer ||
    q.answer.status === "NEEDS_TEACHER_REVIEW" ||
    !q.prompt.trim()
  )
    return null;
  if (q.type !== "MULTIPLE_CHOICE" && q.type !== "TRUE_FALSE") return null;
  const choices = q.choices.length
    ? q.choices
    : q.type === "TRUE_FALSE"
      ? [
          { label: "Đúng", text: "Đúng" },
          { label: "Sai", text: "Sai" },
        ]
      : [];
  if (
    choices.length < 2 ||
    choices.length > 6 ||
    choices.some((c) => !c.text.trim())
  )
    return null;
  const value = normalized(q.answer.value).replace(/[.)]$/u, "");
  const matches = choices.flatMap((c, i) =>
    [normalized(c.label), normalized(c.text)].includes(value) ? [i] : [],
  );
  if (matches.length !== 1) return null;
  return {
    id: `${prefix}:source:${q.id}`,
    level: "UNDERSTANDING",
    prompt: q.prompt,
    options: choices.map((c, i) => ({
      id: `${prefix}:source:${q.id}:option:${i}`,
      text: c.text,
    })),
    correctAnswerIndex: matches[0],
    explanation: q.feedback,
    points: 1,
  };
}
