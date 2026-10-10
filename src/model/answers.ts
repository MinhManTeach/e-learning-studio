import type { Question } from "./schema";

// Right answers of a quiz question. Most questions have one; a question may
// have several (the student must tick all of them and nothing else). A student
// answer is stored as one string so saved progress keeps its shape: one option
// id, or several ids joined by commas (option ids never contain commas).

type Answerable = Pick<
  Question,
  "options" | "correctAnswerIndex" | "correctAnswerIndexes"
>;

/** Indexes of the right options, valid and in order. */
export function correctIndexes(q: Answerable): number[] {
  const raw = q.correctAnswerIndexes?.length
    ? q.correctAnswerIndexes
    : [q.correctAnswerIndex];
  return [...new Set(raw)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < q.options.length)
    .sort((a, b) => a - b);
}
export const isMultiAnswer = (q: Answerable) => correctIndexes(q).length > 1;
export const correctIds = (q: Answerable) =>
  correctIndexes(q).map((i) => q.options[i].id);

/** The question with these right answers; choosing them settles an unknown answer. */
export function withCorrect<Q extends Question>(q: Q, indexes: number[]): Q {
  const list = [...new Set(indexes)]
    .filter((i) => i >= 0 && i < q.options.length)
    .sort((a, b) => a - b);
  const next: Q = {
    ...q,
    correctAnswerIndex: list[0] ?? 0,
    correctAnswerIndexes: list.length > 1 ? list : undefined,
  };
  delete next.answerUnknown;
  if (!next.correctAnswerIndexes) delete next.correctAnswerIndexes;
  return next;
}

export const answerIds = (answer: string | undefined) =>
  (answer ?? "").split(",").filter(Boolean);
export const answerOf = (ids: string[]) => [...new Set(ids)].sort().join(",");

/** Whether a student answer is exactly the set of right options. */
export function isRightAnswer(q: Answerable, answer: string | undefined) {
  const right = correctIds(q);
  const given = new Set(answerIds(answer));
  return (
    right.length > 0 &&
    given.size === right.length &&
    right.every((id) => given.has(id))
  );
}
