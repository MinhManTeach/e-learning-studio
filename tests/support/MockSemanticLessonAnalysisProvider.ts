import {
  SemanticLessonAnalysisProvider,
  type SemanticAnalysisConnection,
} from "../../src/import/analysisService";
import type { LessonAnalysisOptions } from "../../src/import/model";
import type { SemanticAnalysisInput } from "../../src/import/semantic";

/** Test/development fixture adapter. Never imported by the production entry point. */
export class MockSemanticLessonAnalysisProvider extends SemanticLessonAnalysisProvider {
  constructor(
    response:
      | unknown
      | ((
          input: SemanticAnalysisInput,
          options?: LessonAnalysisOptions,
        ) => Promise<unknown>),
  ) {
    const connection: SemanticAnalysisConnection = {
      id: "mock-semantic",
      name: "Semantic fixture (development only)",
      developmentOnly: true,
      async analyze(input, options) {
        return typeof response === "function"
          ? response(input, options)
          : structuredClone(response);
      },
    };
    super(connection);
  }
}
