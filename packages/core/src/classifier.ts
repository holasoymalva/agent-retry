import type {
  FailureCategory,
  FailureClassification,
  FailureClassifier,
  FailureClassifierInput,
  FailureSignal,
} from "./types.js";

const patterns: readonly [RegExp, FailureCategory][] = [
  [/\b(?:429|rate.?limit|too many requests)\b/i, "rate_limit"],
  [/\b(?:403|permission denied|forbidden|unauthori[sz]ed)\b/i, "permission_error"],
  [/\b(?:econnreset|econnrefused|enotfound|network|socket hang up)\b/i, "network_error"],
  [/\b(?:enomem|out of memory)\b/i, "environment_error"],
  [/\b(?:module not found|cannot find module|dependency)\b/i, "dependency_error"],
  [/\b(?:missing context|insufficient context)\b/i, "missing_context"],
];

function inferCategory(message: string): FailureCategory {
  for (const [pattern, category] of patterns) {
    if (pattern.test(message)) return category;
  }
  return "agent_error";
}

/** Deterministic default classifier; evaluator failures take precedence. */
export class DefaultFailureClassifier implements FailureClassifier {
  async classify(input: FailureClassifierInput): Promise<FailureClassification> {
    const evaluationFailures = input.evaluation?.failures ?? [];
    if (evaluationFailures.length > 0) return { failures: evaluationFailures };

    const { result } = input;
    if (result.status === "completed" && input.evaluation?.success !== false) {
      return { failures: [] };
    }

    const message = result.error?.message ?? `${result.status} without a detailed error`;
    const category: FailureCategory =
      result.status === "timeout"
        ? "timeout"
        : result.status === "cancelled"
          ? "agent_error"
          : inferCategory(message);
    const failure: FailureSignal = {
      category,
      message,
      severity: category === "permission_error" ? "high" : "medium",
      retryable: !["permission_error", "policy_violation", "destructive_change"].includes(category),
      source: "agent",
    };
    return { failures: [failure] };
  }
}
