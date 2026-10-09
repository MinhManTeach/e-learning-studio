import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Walks relative imports from an entry file and returns every reachable source file.
function reachable(entry: string) {
  const seen = new Set<string>();
  const queue = [resolve(entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const [, spec] of text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const base = join(dirname(file), spec);
      const found = [".ts", ".tsx", "/index.ts"]
        .map((ext) => base + ext)
        .find((p) => existsSync(p));
      if (found) queue.push(found);
    }
  }
  return [...seen];
}

describe("model layer boundaries", () => {
  it.each(["src/model/factories.ts", "src/model/schema.ts"])(
    "%s does not depend on React components",
    (entry) => {
      const files = reachable(entry);
      expect(files.filter((f) => f.endsWith(".tsx"))).toEqual([]);
      for (const f of files)
        expect(readFileSync(f, "utf8")).not.toMatch(/from\s+"react(-dom)?"/);
    },
  );
});
