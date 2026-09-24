import type {
  PolicyResult,
  RecoveryAction,
  RecoveryDecision,
  RecoveryDecisionInput,
  RuntimePolicy,
} from "./types.js";

/** Simple allow-list policy. Destructive actions are denied by default. */
export class AllowListPolicy implements RuntimePolicy {
  readonly #allowed: ReadonlySet<RecoveryAction>;

  constructor(
    allowed: readonly RecoveryAction[] = [
      "retry_same",
      "retry_with_context",
      "retry_with_modified_instructions",
      "retry_with_stronger_model",
      "switch_agent",
      "wait_and_retry",
      "ask_human",
      "abort",
    ],
  ) {
    this.#allowed = new Set(allowed);
  }

  async canExecuteRecovery(
    decision: RecoveryDecision,
    input: RecoveryDecisionInput,
  ): Promise<PolicyResult> {
    const taskAllowed = input.task.constraints?.allowedRecoveryActions;
    if (
      !this.#allowed.has(decision.action) ||
      (taskAllowed && !taskAllowed.includes(decision.action))
    ) {
      return { allowed: false, reason: `Recovery action '${decision.action}' is not allowed` };
    }
    return { allowed: true };
  }
}
