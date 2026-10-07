// Future exported players use this boundary. The authoring editor never initializes SCORM.
export interface LmsAdapter {
  initialize(): Promise<boolean>;
  setScore(score: number, max: number, min: number): Promise<void>;
  setStatus(
    status: "incomplete" | "completed" | "passed" | "failed",
  ): Promise<void>;
  readSuspendData(): Promise<string>;
  writeSuspendData(data: string): Promise<void>;
  finish(): Promise<void>;
}
export class StandaloneAdapter implements LmsAdapter {
  async initialize() {
    return true;
  }
  async setScore() {}
  async setStatus() {}
  async readSuspendData() {
    return "";
  }
  async writeSuspendData() {}
  async finish() {}
}
// A future Scorm12Adapter will wrap the preserved reference/scorm_api.js helper.
