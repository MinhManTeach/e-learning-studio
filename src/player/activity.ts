// Checking for practice activities (sắp xếp, phân loại, nối). Pure functions so
// the editor preview, the exported player and tests behave the same.
import type { Slide } from "../model/schema";

type ActivitySlide = Extract<Slide, { type: "activity" }>;
export type ActivityItem = ActivitySlide["data"]["items"][number];

function hash(s: string) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** A stable shuffle that never shows the answer order (when there are 2+ items). */
export function shuffled<T extends { id: string }>(items: T[], seed: string) {
  const out = [...items].sort(
    (a, b) => hash(seed + a.id) - hash(seed + b.id) || a.id.localeCompare(b.id),
  );
  if (out.length > 1 && out.every((x, i) => x.id === items[i].id))
    out.push(out.shift()!);
  return out;
}
/** ORDER: which positions hold the right item. */
export function checkOrder(answer: string[], items: ActivityItem[]) {
  return items.map((item, i) => answer[i] === item.id);
}
/** SORT: whether each placed item sits in its group. */
export function checkSort(
  placed: Record<string, number>,
  items: ActivityItem[],
) {
  return Object.fromEntries(
    items.map((item) => [item.id, placed[item.id] === item.group]),
  );
}
/** MATCH: pairs are left item id -> id of the item whose match text was chosen. */
export function checkMatch(
  pairs: Record<string, string>,
  items: ActivityItem[],
) {
  return Object.fromEntries(
    items.map((item) => {
      const chosen = items.find((x) => x.id === pairs[item.id]);
      // Two items may share the same match text; either one is right.
      return [item.id, !!chosen && chosen.match.trim() === item.match.trim()];
    }),
  );
}
export const allRight = (marks: boolean[] | Record<string, boolean>) =>
  Object.values(marks).every(Boolean);
