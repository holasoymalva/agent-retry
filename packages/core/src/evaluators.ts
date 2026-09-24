import type { EvaluationContext, EvaluationResult, Evaluator } from "./types.js";

/** Creates an evaluator from an async validation function. */
export function functionEvaluator<TResult = unknown>(
  evaluate: (context: EvaluationContext<TResult>) => Promise<EvaluationResult> | EvaluationResult,
  id = "function",
): Evaluator<TResult> {
  return { id, evaluate: async (context) => evaluate(context) };
}

/** Combines evaluators using all, any, or weighted success semantics. */
export function compositeEvaluator<TResult = unknown>(
  evaluators: readonly Evaluator<TResult>[],
  options: { strategy?: "all" | "any" | "weighted"; threshold?: number } = {},
): Evaluator<TResult> {
  const strategy = options.strategy ?? "all";
  return {
    id: `composite:${strategy}`,
    async evaluate(context) {
      const results = await Promise.all(evaluators.map((evaluator) => evaluator.evaluate(context)));
      const scores = results.map((result) => result.score ?? (result.success ? 1 : 0));
      const score =
        scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 1;
      const success =
        strategy === "all"
          ? results.every((result) => result.success)
          : strategy === "any"
            ? results.some((result) => result.success)
            : score >= (options.threshold ?? 0.5);
      return {
        success,
        score,
        failures: results.flatMap((result) => result.failures ?? []),
        observations: results.flatMap((result) => result.observations ?? []),
      };
    },
  };
}

/** Minimal structural schema contract compatible with Zod and similar libraries. */
export interface ParseableSchema<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string } };
}

/** Validates an agent's output against a runtime schema. */
export function schemaEvaluator<T>(schema: ParseableSchema<T>): Evaluator<unknown> {
  return {
    id: "schema",
    async evaluate({ result }) {
      const parsed = schema.safeParse(result.output);
      return parsed.success
        ? { success: true, score: 1 }
        : {
            success: false,
            score: 0,
            failures: [
              {
                category: "invalid_output",
                message: parsed.error.message,
                severity: "medium",
                retryable: true,
                source: "schema",
              },
            ],
          };
    },
  };
}
