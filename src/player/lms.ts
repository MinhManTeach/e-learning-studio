// Boundary between the lesson player and wherever it runs. The authoring editor
// never talks to an LMS; only an exported package creates one of these adapters.
export type LmsStatus = "incomplete" | "completed" | "passed" | "failed";
export interface LmsReport {
  status: LmsStatus;
  /** Percentage 0–100; omitted until the student has submitted a quiz. */
  score?: number;
  suspendData: string;
  /** 1-based page number shown to teachers in LMS reports. */
  location: string;
}
export interface LmsAdapter {
  readonly kind: "SCORM_1_2" | "STANDALONE";
  initialize(): boolean;
  readSuspendData(): string;
  /** The learner's name as the LMS knows it ("" when unknown). */
  studentName(): string;
  report(update: LmsReport): void;
  finish(): void;
}

/** The SCORM 1.2 runtime API an LMS exposes as `window.API`. */
export interface Scorm12Api {
  LMSInitialize(arg: ""): string;
  LMSFinish(arg: ""): string;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string;
  LMSCommit(arg: ""): string;
  LMSGetLastError(): string;
}
type ApiWindow = { API?: Scorm12Api; parent?: ApiWindow; opener?: ApiWindow };

function searchParents(start: ApiWindow | null | undefined, maxHops: number) {
  let win = start;
  for (let hop = 0; win && hop <= maxHops; hop++) {
    try {
      if (win.API) return win.API;
      if (!win.parent || win.parent === win) return null;
      win = win.parent;
    } catch {
      // A cross-origin frame cannot be inspected; the API is not above it.
      return null;
    }
  }
  return null;
}
/** Standard SCORM 1.2 discovery: walk up the frames, then the opener's frames. */
export function findScormApi(win: Window, maxHops = 500): Scorm12Api | null {
  const w = win as unknown as ApiWindow;
  return searchParents(w, maxHops) ?? searchParents(w.opener, maxHops);
}

/** SCORM 1.2 caps cmi.suspend_data at 4096 characters. */
export const scorm12SuspendLimit = 4096;
const truthy = (v: unknown) => v === true || v === "true";

/**
 * SCORM 1.2 gives the name as "Last, First". Vietnamese names are written family
 * name first, so "Nguyễn Văn, An" becomes "Nguyễn Văn An".
 */
export function formatLmsName(raw: string) {
  const [last, ...rest] = raw.split(",");
  return [last, rest.join(",")]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function scormTimespan(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.min(9999, Math.floor(total / 3600));
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)}`;
}

export class Scorm12Adapter implements LmsAdapter {
  readonly kind = "SCORM_1_2" as const;
  private active = false;
  private startedAt = 0;
  private lastStatus: LmsStatus | "" = "";
  private commitTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private api: Scorm12Api,
    private now: () => number = Date.now,
    private commitDelayMs = 1500,
  ) {}
  initialize() {
    if (this.active) return true;
    this.active = truthy(this.api.LMSInitialize(""));
    if (!this.active) return false;
    this.startedAt = this.now();
    const status = this.api.LMSGetValue("cmi.core.lesson_status");
    if (!status || status === "not attempted") {
      this.api.LMSSetValue("cmi.core.lesson_status", "incomplete");
      this.lastStatus = "incomplete";
    } else if (["completed", "passed", "failed"].includes(status)) {
      this.lastStatus = status as LmsStatus;
    }
    return true;
  }
  readSuspendData() {
    return this.active ? this.api.LMSGetValue("cmi.suspend_data") || "" : "";
  }
  studentName() {
    return this.active
      ? formatLmsName(this.api.LMSGetValue("cmi.core.student_name") || "")
      : "";
  }
  report(update: LmsReport) {
    if (!this.active) return;
    const api = this.api;
    // Never move a finished attempt back to "incomplete" (e.g. a review visit).
    const status =
      update.status === "incomplete" &&
      this.lastStatus &&
      this.lastStatus !== "incomplete"
        ? this.lastStatus
        : update.status;
    api.LMSSetValue("cmi.core.lesson_status", status);
    this.lastStatus = status;
    if (update.score !== undefined) {
      api.LMSSetValue("cmi.core.score.min", "0");
      api.LMSSetValue("cmi.core.score.max", "100");
      api.LMSSetValue("cmi.core.score.raw", String(Math.round(update.score)));
    }
    if (update.suspendData.length <= scorm12SuspendLimit)
      api.LMSSetValue("cmi.suspend_data", update.suspendData);
    api.LMSSetValue("cmi.core.lesson_location", update.location.slice(0, 255));
    // "suspend" lets the LMS resume this attempt next time instead of starting over.
    api.LMSSetValue("cmi.core.exit", status === "incomplete" ? "suspend" : "");
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      if (this.active) api.LMSCommit("");
    }, this.commitDelayMs);
  }
  finish() {
    if (!this.active) return;
    clearTimeout(this.commitTimer);
    this.api.LMSSetValue(
      "cmi.core.session_time",
      scormTimespan(this.now() - this.startedAt),
    );
    this.api.LMSCommit("");
    this.api.LMSFinish("");
    this.active = false;
  }
}

/**
 * Used when the package is opened straight from disk (no LMS). Progress is kept in
 * this browser only so a student can continue where they stopped.
 */
export class StandaloneAdapter implements LmsAdapter {
  readonly kind = "STANDALONE" as const;
  constructor(
    private key: string,
    private storage: Pick<Storage, "getItem" | "setItem"> | null,
  ) {}
  initialize() {
    return true;
  }
  studentName() {
    return "";
  }
  readSuspendData() {
    try {
      return this.storage?.getItem(this.key) ?? "";
    } catch {
      return "";
    }
  }
  report(update: LmsReport) {
    try {
      this.storage?.setItem(this.key, update.suspendData);
    } catch {
      // Private browsing or full storage: the lesson still works, just without resume.
    }
  }
  finish() {}
}

export function connectLms(win: Window, lessonId: string): LmsAdapter {
  const api = findScormApi(win);
  if (api) {
    const scorm = new Scorm12Adapter(api);
    if (scorm.initialize()) return scorm;
  }
  let storage: Storage | null = null;
  try {
    storage = win.localStorage;
  } catch {
    storage = null;
  }
  return new StandaloneAdapter(`elearning-studio:resume:${lessonId}`, storage);
}
