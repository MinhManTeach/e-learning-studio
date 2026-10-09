// Minimal typing for the jsdom API used by the export end-to-end test
// (jsdom ships without types and @types/jsdom is not a dependency).
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: { url?: string; runScripts?: "dangerously" | "outside-only" },
    );
    readonly window: Window & typeof globalThis;
  }
}
