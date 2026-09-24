import type {
  FailureCategory,
  RecoveryAction,
  RecoveryDecision,
  RecoveryDecisionEngine,
  RecoveryDecisionInput,
} from "./types.js";

const defaultActions: Readonly<Partial<Record<FailureCategory, RecoveryAction>>> = {
  network_error: "wait_and_retry",
  rate_limit: "wait_and_retry",
  timeout: "retry_same",
  missing_context: "retry_with_context",
  validation_failure: "retry_with_context",
  test_failure: "retry_with_context",
  build_failure: "retry_with_context",
  lint_failure: "retry_with_context",
  invalid_output: "retry_with_context",
  permission_error: "abort",
  policy_violation: "abort",
  destructive_change: "rollback",
  agent_error: "retry_same",
};

/** Conservative built-in engine used when no custom engine is configured. */
export class DefaultRecoveryDecisionEngine implements RecoveryDecisionEngine {
  async decide(input: RecoveryDecisionInput): Promise<RecoveryDecision> {
    const failure = input.failures[0];
    const action = failure ? (defaultActions[failure.category] ?? "abort") : "abort";
    const evidence = input.failures.map((item) => item.message);
    return {
      action,
      confidence: action === "abort" ? 0.8 : 0.7,
      reason: failure
        ? `Default recovery for ${failure.category}`
        : "No failure evidence was available",
      evidence,
      ...(action === "wait_and_retry" ? { delayMs: 100 } : {}),
      ...(action === "retry_with_context" ? { additionalContext: evidence } : {}),
    };
  }
}
