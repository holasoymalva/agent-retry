import type {
  RecoveryAction,
  RecoveryDecision,
  RecoveryDecisionEngine,
  RecoveryDecisionInput,
} from "agent-retry";
import { createJevClient, type JevClientOptions } from "./client.js";

export * from "./client.js";

const candidateActions: readonly RecoveryAction[] = [
  "retry_same",
  "retry_with_context",
  "retry_with_stronger_model",
  "switch_agent",
  "ask_human",
  "abort",
];

function summarize(input: RecoveryDecisionInput): string {
  return JSON.stringify({
    attempt: input.attempt.index,
    failures: input.failures.map(({ category, message, retryable }) => ({
      category,
      message: message.slice(0, 1_000),
      retryable,
    })),
    history: input.history,
    budget: input.budget,
    availableAgents: input.availableAgents.map(({ id, capabilities }) => ({ id, capabilities })),
  });
}

/** Optional constrained recovery engine backed by a Jev-compatible endpoint. */
export function jevDecisionEngine(
  options: JevClientOptions & { readonly fallback?: RecoveryDecisionEngine },
): RecoveryDecisionEngine {
  const client = createJevClient(options);
  return {
    async decide(input): Promise<RecoveryDecision> {
      try {
        const response = await client.decide({
          context: summarize(input),
          choices: candidateActions,
        });
        return {
          action: response.action,
          ...(response.confidence !== undefined ? { confidence: response.confidence } : {}),
          ...(response.reason !== undefined ? { reason: response.reason } : {}),
          ...(response.targetAgent !== undefined ? { targetAgent: response.targetAgent } : {}),
          ...(response.targetModel !== undefined ? { targetModel: response.targetModel } : {}),
          ...(response.delayMs !== undefined ? { delayMs: response.delayMs } : {}),
          ...(response.additionalContext !== undefined
            ? { additionalContext: response.additionalContext }
            : {}),
          ...(response.instructionPatch !== undefined
            ? { instructionPatch: response.instructionPatch }
            : {}),
        };
      } catch (error) {
        if (options.fallback) return options.fallback.decide(input);
        return {
          action: "abort",
          confidence: 1,
          reason: `Decision provider unavailable: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
