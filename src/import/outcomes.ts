import type { PedagogicalAnalysis } from "./model";

/** A requirement keeps one primary category. The parent flag is not a duplicate objective. */
export function requiredOutcomeStatements(a: PedagogicalAnalysis) {
  return a.classifications.filter((c) => {
    if (c.isHeading || !c.isRequiredOutcome || c.needsReview) return false;
    const m = c.field.match(/^(\w+)\[(\d+)\]$/);
    const values = m ? a[m[1] as keyof PedagogicalAnalysis] : undefined;
    return (
      Array.isArray(values) &&
      typeof values[Number(m![2])] === "string" &&
      !!(values[Number(m![2])] as string).trim()
    );
  });
}
export function outcomeSummaryCount(a: PedagogicalAnalysis) {
  const categorized = requiredOutcomeStatements(a).filter(
    (c) => !["LEARNING_OUTCOME", "KNOWLEDGE"].includes(c.category),
  );
  return (
    a.learningOutcomes.filter((x) => x.trim()).length +
    a.knowledgeObjectives.filter((x) => x.trim()).length +
    categorized.length
  );
}
