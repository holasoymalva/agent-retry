import type {
  FailureCategory,
  RecoveryDecision,
  RecoveryDecisionEngine,
  RecoveryDecisionInput,
} from "@agent-retry/core";

/** One ordered deterministic recovery rule. */
export interface RecoveryRule {
  readonly when: (input: RecoveryDecisionInput) => boolean;
  readonly decision: RecoveryDecision | ((input: RecoveryDecisionInput) => RecoveryDecision);
}

/** Creates a predicate that matches a normalized failure category. */
export function failure(category: FailureCategory): (input: RecoveryDecisionInput) => boolean {
  return (input) => input.failures.some((item) => item.category === category);
}

/** Creates a deterministic, first-match decision engine. */
export function rulesDecisionEngine(options: {
  readonly rules: readonly RecoveryRule[];
  readonly fallback?: RecoveryDecision;
}): RecoveryDecisionEngine {
  return {
    async decide(input) {
      const rule = options.rules.find((candidate) => candidate.when(input));
      if (!rule) {
        return (
          options.fallback ?? {
            action: "abort",
            confidence: 1,
            reason: "No deterministic recovery rule matched",
          }
        );
      }
      return typeof rule.decision === "function" ? rule.decision(input) : rule.decision;
    },
  };
}

/** Selects between deterministic and intelligent engines using an explicit predicate. */
export function hybridDecisionEngine(options: {
  readonly deterministic: RecoveryDecisionEngine;
  readonly intelligent: RecoveryDecisionEngine;
  readonly useIntelligentWhen: (input: RecoveryDecisionInput) => boolean;
}): RecoveryDecisionEngine {
  return {
    decide: (input) =>
      options.useIntelligentWhen(input)
        ? options.intelligent.decide(input)
        : options.deterministic.decide(input),
  };
}
