import type { LessonProject } from "../model/schema";
import {
  aggregateQuiz,
  deriveCompletionState,
  type LessonSessionState,
} from "./session";

export interface CertificateStatus {
  eligible: boolean;
  /** Why the certificate is not available yet ("" when eligible). */
  reason: string;
  hasQuiz: boolean;
  score: number;
}

/** A certificate is earned by finishing the lesson and, when it has a quiz, passing it. */
export function certificateStatus(
  p: LessonProject,
  s: LessonSessionState,
): CertificateStatus {
  const state = deriveCompletionState(p, s);
  const quiz = aggregateQuiz(p, s);
  const eligible = state === "PASSED" || state === "COMPLETED";
  return {
    eligible,
    reason: eligible
      ? ""
      : state === "FAILED"
        ? `Đạt từ ${p.settings.passingScore}% trở lên để nhận giấy chứng nhận.`
        : "Hoàn thành bài học để nhận giấy chứng nhận.",
    hasQuiz: quiz.hasQuiz,
    score: quiz.score,
  };
}

export function formatDateVi(d: Date) {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fnv1a(text: string, seed: number) {
  let h = seed >>> 0;
  for (const c of text) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Crockford base32: no I, L, O, U, so codes are easy to read aloud and type.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function base32(n: number, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[n % 32];
    n = Math.floor(n / 32);
  }
  return out;
}

/**
 * A check code printed on the certificate. The same lesson, name, score and date
 * always give the same code, so a teacher can recompute it to spot a typed-in
 * change. It is not a server-backed signature.
 */
export function certificateCode(
  lessonId: string,
  name: string,
  score: number,
  issuedOn: Date,
) {
  const key = [
    lessonId,
    name.trim().normalize("NFC").toLocaleLowerCase("vi"),
    Math.round(score),
    formatDateVi(issuedOn),
  ].join("|");
  return `${base32(fnv1a(key, 2166136261), 4)}-${base32(fnv1a(key, 0x9e3779b9), 4)}`;
}
