import { resolve } from "node:path";
import { build, type Plugin, type Rollup } from "vite";
import react from "@vitejs/plugin-react";

export const playerModuleId = "virtual:lesson-player";
const resolvedId = "\0" + playerModuleId;

export interface PlayerBundle {
  js: string;
  css: string;
}

/**
 * Builds the student player (src/export/playerMain.tsx) as one classic IIFE script
 * plus one stylesheet. Classic scripts run from file://, where ES modules are
 * blocked, so the same files work offline and inside an LMS.
 */
export async function buildPlayerBundle(root: string): Promise<PlayerBundle> {
  // Vite and the React plugin decide "production" from NODE_ENV, which is
  // "development" under `npm run dev` and "test" under Vitest. Without this the
  // package would use React's dev JSX runtime, which the production React build
  // does not provide, and the exported page would stay blank.
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    return await buildProductionBundle(root);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

async function buildProductionBundle(root: string): Promise<PlayerBundle> {
  const result = await build({
    configFile: false,
    root,
    mode: "production",
    logLevel: "warn",
    plugins: [react()],
    // Library builds keep process.env.NODE_ENV; React needs it replaced.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      copyPublicDir: false,
      emptyOutDir: false,
      minify: true,
      cssCodeSplit: false,
      lib: {
        entry: resolve(root, "src/export/playerMain.tsx"),
        name: "LessonPlayer",
        formats: ["iife"],
        fileName: () => "player.js",
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (r) => (r as Rollup.RollupOutput).output,
  );
  let js = "";
  let css = "";
  for (const item of outputs) {
    if (item.type === "chunk") js += item.code;
    else if (item.fileName.endsWith(".css"))
      css +=
        typeof item.source === "string"
          ? item.source
          : new TextDecoder().decode(item.source);
  }
  if (!js) throw new Error("Player bundle produced no JavaScript.");
  return { js, css };
}

/** Exposes the built player to the app as `virtual:lesson-player`. */
export function playerBundlePlugin(): Plugin {
  let root = process.cwd();
  let bundle: Promise<PlayerBundle> | undefined;
  return {
    name: "lesson-player-bundle",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === playerModuleId ? resolvedId : undefined;
    },
    async load(id) {
      if (id !== resolvedId) return;
      bundle ??= buildPlayerBundle(root);
      let built: PlayerBundle;
      try {
        built = await bundle;
      } catch (error) {
        bundle = undefined; // allow a retry after the source is fixed
        throw error;
      }
      return `export const playerJs = ${JSON.stringify(built.js)};\nexport const playerCss = ${JSON.stringify(built.css)};\n`;
    },
  };
}
