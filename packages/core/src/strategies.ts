import { setTimeout as delay } from "node:timers/promises";
import type {
  RecoveryAction,
  RecoveryContext,
  RecoveryExecutionContext,
  RecoveryExecutionResult,
  RecoveryStrategy,
} from "./types.js";

class BuiltInStrategy implements RecoveryStrategy {
  constructor(readonly action: RecoveryAction) {}

  async execute(context: RecoveryExecutionContext): Promise<RecoveryExecutionResult> {
    const { decision } = context;
    if (decision.action === "abort" || decision.action === "ask_human") return { continue: false };
    if (decision.action === "wait_and_retry") {
      await delay(Math.max(0, decision.delayMs ?? 100), undefined, { signal: context.signal });
    }
    if (decision.action === "rollback") {
      if (!context.workspace || !context.input.workspace) return { continue: false };
      await context.workspace.restore(context.input.workspace);
    }
    if (decision.action === "reset_workspace") return { continue: false };

    const previous: RecoveryContext = context.recoveryContext ?? {};
    return {
      continue: true,
      recoveryContext: {
        additionalContext: [
          ...(previous.additionalContext ?? []),
          ...(decision.additionalContext ?? []),
        ],
        ...(decision.instructionPatch !== undefined
          ? { instructionPatch: decision.instructionPatch }
          : previous.instructionPatch !== undefined
            ? { instructionPatch: previous.instructionPatch }
            : {}),
        ...(decision.targetModel !== undefined
          ? { model: decision.targetModel }
          : previous.model !== undefined
            ? { model: previous.model }
            : {}),
      },
      ...(decision.targetAgent !== undefined ? { targetAgent: decision.targetAgent } : {}),
    };
  }
}

/** Creates the built-in safe recovery strategies. */
export function createBuiltInStrategies(): readonly RecoveryStrategy[] {
  return [
    "retry_same",
    "retry_with_context",
    "retry_with_modified_instructions",
    "retry_with_stronger_model",
    "switch_agent",
    "wait_and_retry",
    "reset_workspace",
    "rollback",
    "ask_human",
    "abort",
  ].map((action) => new BuiltInStrategy(action as RecoveryAction));
}
