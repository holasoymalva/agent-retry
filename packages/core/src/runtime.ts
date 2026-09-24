import { createHash, randomUUID } from "node:crypto";
import { RetryBudget } from "./budget.js";
import { DefaultFailureClassifier } from "./classifier.js";
import { DefaultRecoveryDecisionEngine } from "./default-engine.js";
import { OperationTimeoutError } from "./errors.js";
import { type AgentRetryEventMap, AgentRetryEvents } from "./events.js";
import { AllowListPolicy } from "./policy.js";
import { AgentRegistry } from "./registry.js";
import { RunStateMachine } from "./state-machine.js";
import { createBuiltInStrategies } from "./strategies.js";
import { withTimeout } from "./timeout.js";
import type {
  AgentAdapter,
  AgentRetryResult,
  AgentRunResult,
  AgentTask,
  AgentUsage,
  AggregateUsage,
  AttemptRecord,
  AttemptSummary,
  EvaluationResult,
  Evaluator,
  FailureClassifier,
  FailureSignal,
  RecoveryContext,
  RecoveryDecision,
  RecoveryDecisionEngine,
  RecoveryExecutionResult,
  RecoveryStrategy,
  RetryBudgetConfig,
  RuntimePolicy,
  SerializedError,
  Workspace,
  WorkspaceSnapshot,
} from "./types.js";

/** Side-effect-free lifecycle callbacks. */
export interface AgentRetryHooks<TResult = unknown> {
  readonly beforeAttempt?: (context: { runId: string; attempt: number }) => void | Promise<void>;
  readonly afterAttempt?: (attempt: AttemptRecord<TResult>) => void | Promise<void>;
  readonly beforeRecovery?: (decision: RecoveryDecision) => void | Promise<void>;
  readonly afterRecovery?: (decision: RecoveryDecision) => void | Promise<void>;
  readonly onSuccess?: (result: AgentRetryResult<TResult>) => void | Promise<void>;
  readonly onFailure?: (result: AgentRetryResult<TResult>) => void | Promise<void>;
}

/** Runtime configuration. All executions are bounded. */
export interface AgentRetryConfig<TResult = unknown> extends Partial<RetryBudgetConfig> {
  readonly evaluator?: Evaluator<TResult>;
  readonly decisionEngine?: RecoveryDecisionEngine;
  readonly classifier?: FailureClassifier;
  readonly policy?: RuntimePolicy;
  readonly workspace?: Workspace;
  readonly agents?: readonly AgentAdapter[];
  readonly strategies?: readonly RecoveryStrategy[];
  readonly hooks?: AgentRetryHooks<TResult>;
}

/** Input for a runtime execution. */
export interface AgentRetryRunInput<TTask = unknown, TResult = unknown> {
  readonly task: AgentTask<TTask>;
  readonly agent: AgentAdapter<TTask, TResult>;
  readonly signal?: AbortSignal;
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
      ...(code !== undefined ? { code } : {}),
    };
  }
  return { name: "Error", message: String(error) };
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof OperationTimeoutError ||
    (error instanceof DOMException && error.name === "TimeoutError")
  );
}

function summary(attempt: AttemptRecord): AttemptSummary {
  return {
    id: attempt.id,
    index: attempt.index,
    agentId: attempt.agentId,
    status: attempt.result.status,
    failureCategories: (attempt.failures ?? []).map((failure) => failure.category),
    ...(attempt.recoveryDecision ? { recoveryAction: attempt.recoveryDecision.action } : {}),
  };
}

function failureSignature(failures: readonly FailureSignal[]): string {
  const normalized = failures
    .map(
      (failure) =>
        `${failure.category}:${failure.message.toLowerCase().replace(/\s+/g, " ").trim()}`,
    )
    .sort()
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

function madeProgress(previous: AttemptRecord | undefined, current: AttemptRecord): boolean {
  if (!previous) return false;
  const previousScore = previous.evaluation?.score;
  const currentScore = current.evaluation?.score;
  if (previousScore !== undefined && currentScore !== undefined && currentScore > previousScore) {
    return true;
  }
  return (current.failures?.length ?? 0) < (previous.failures?.length ?? 0);
}

const recoveryActions = new Set([
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
]);

function invalidDecisionReason(
  decision: unknown,
  availableAgentIds: ReadonlySet<string>,
): string | undefined {
  if (typeof decision !== "object" || decision === null || !("action" in decision)) {
    return "Decision engine returned an invalid decision";
  }
  const candidate = decision as Record<string, unknown>;
  if (typeof candidate.action !== "string" || !recoveryActions.has(candidate.action)) {
    return `Decision engine returned unknown action '${String(candidate.action)}'`;
  }
  if (
    candidate.confidence !== undefined &&
    (typeof candidate.confidence !== "number" ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1)
  ) {
    return "Decision confidence must be between 0 and 1";
  }
  if (
    candidate.delayMs !== undefined &&
    (typeof candidate.delayMs !== "number" ||
      !Number.isFinite(candidate.delayMs) ||
      candidate.delayMs < 0)
  ) {
    return "Decision delayMs must be a non-negative finite number";
  }
  if (candidate.action === "switch_agent") {
    if (
      typeof candidate.targetAgent !== "string" ||
      !availableAgentIds.has(candidate.targetAgent)
    ) {
      return `Target agent '${String(candidate.targetAgent)}' is not available`;
    }
  }
  return undefined;
}

function aggregateUsage(attempts: readonly AttemptRecord[]): AggregateUsage {
  return attempts.reduce<AggregateUsage>(
    (total, attempt) => ({
      inputTokens: total.inputTokens + (attempt.usage?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (attempt.usage?.outputTokens ?? 0),
      totalTokens: total.totalTokens + (attempt.usage?.totalTokens ?? 0),
      estimatedCostUsd: total.estimatedCostUsd + (attempt.usage?.estimatedCostUsd ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  );
}

function mergeBudget<TResult>(
  config: AgentRetryConfig<TResult>,
  task: AgentTask,
): RetryBudgetConfig {
  const maxAttempts = Math.min(config.maxAttempts ?? 3, task.constraints?.maxAttempts ?? Infinity);
  const optionalMin = (left?: number, right?: number): number | undefined => {
    if (left === undefined) return right;
    if (right === undefined) return left;
    return Math.min(left, right);
  };
  const timeoutMs = optionalMin(config.timeoutMs, task.constraints?.timeoutMs);
  const maxCostUsd = optionalMin(config.maxCostUsd, task.constraints?.maxCostUsd);
  const maxTokens = optionalMin(config.maxTokens, task.constraints?.maxTokens);
  return {
    maxAttempts,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    maxConsecutiveSameFailure: config.maxConsecutiveSameFailure ?? 2,
  };
}

/** Executes the explicit execute/evaluate/classify/decide/recover state machine. */
export class AgentRetryRuntime<TResult = unknown> {
  readonly #config: AgentRetryConfig<TResult>;
  readonly #events = new AgentRetryEvents<TResult>();

  constructor(config: AgentRetryConfig<TResult> = {}) {
    this.#config = config;
  }

  on<K extends keyof AgentRetryEventMap<TResult>>(
    event: K,
    listener: (payload: AgentRetryEventMap<TResult>[K]) => void,
  ): () => void {
    return this.#events.on(event, listener);
  }

  async run<TTask>(input: AgentRetryRunInput<TTask, TResult>): Promise<AgentRetryResult<TResult>> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const machine = new RunStateMachine();
    const budgetConfig = mergeBudget(this.#config, input.task);
    const budget = new RetryBudget(budgetConfig);
    const classifier = this.#config.classifier ?? new DefaultFailureClassifier();
    const decisionEngine = this.#config.decisionEngine ?? new DefaultRecoveryDecisionEngine();
    const policy = this.#config.policy ?? new AllowListPolicy();
    const registry = new AgentRegistry([input.agent, ...(this.#config.agents ?? [])]);
    const strategies = new Map(
      [...createBuiltInStrategies(), ...(this.#config.strategies ?? [])].map((strategy) => [
        strategy.action,
        strategy,
      ]),
    );
    const attempts: AttemptRecord<TResult>[] = [];
    let currentAgent: AgentAdapter<TTask, TResult> = input.agent;
    let recoveryContext: RecoveryContext | undefined;
    let lastSignature: string | undefined;
    let lastAction: string | undefined;
    let consecutiveSame = 0;
    let workspaceSnapshot: WorkspaceSnapshot | undefined;
    const runTimeoutMs = budgetConfig.timeoutMs;
    const runStartedAtMs = Date.now();
    const runSignal =
      runTimeoutMs !== undefined
        ? input.signal
          ? AbortSignal.any([input.signal, AbortSignal.timeout(runTimeoutMs)])
          : AbortSignal.timeout(runTimeoutMs)
        : input.signal;
    const runOperation = <T>(operation: (signal?: AbortSignal) => Promise<T>): Promise<T> =>
      runTimeoutMs !== undefined
        ? withTimeout(
            (signal) => operation(signal),
            Math.max(1, runTimeoutMs - (Date.now() - runStartedAtMs)),
            runSignal,
          )
        : operation(runSignal);

    this.#events.emit("run:start", { runId, startedAt });
    machine.transition("running");

    const finish = async (
      status: AgentRetryResult<TResult>["status"],
      output?: TResult,
    ): Promise<AgentRetryResult<TResult>> => {
      const result: AgentRetryResult<TResult> = {
        runId,
        status,
        ...(output !== undefined ? { output } : {}),
        attempts: [...attempts],
        usage: aggregateUsage(attempts),
        startedAt,
        completedAt: new Date().toISOString(),
      };
      if (status === "succeeded") {
        this.#events.emit("run:success", { result });
        await this.#config.hooks?.onSuccess?.(result);
      } else {
        this.#events.emit(status === "exhausted" ? "run:exhausted" : "run:abort", { result });
        await this.#config.hooks?.onFailure?.(result);
      }
      return result;
    };

    while (budget.canAttempt()) {
      if (runSignal?.aborted) {
        const timedOut = budget.snapshot().reason === "timeout";
        machine.transition(timedOut ? "exhausted" : "aborted");
        return finish(timedOut ? "exhausted" : "aborted");
      }
      budget.consumeAttempt();
      const index = budget.snapshot().attemptsUsed;
      await this.#config.hooks?.beforeAttempt?.({ runId, attempt: index });
      this.#events.emit("attempt:start", { runId, attempt: index, agentId: currentAgent.id });
      workspaceSnapshot ??= this.#config.workspace
        ? await this.#config.workspace.snapshot()
        : undefined;
      const attemptStartedAt = new Date().toISOString();
      let agentResult: AgentRunResult<TResult>;
      let operationTimedOut = false;
      try {
        const execute = (signal?: AbortSignal) =>
          currentAgent.run({
            task: input.task.input,
            attempt: index,
            previousAttempts: attempts.map(summary),
            ...(recoveryContext !== undefined ? { recoveryContext } : {}),
            ...(signal !== undefined ? { signal } : {}),
          });
        agentResult = await runOperation(execute);
      } catch (error) {
        operationTimedOut = isTimeoutError(error);
        agentResult = {
          status:
            runSignal?.aborted || isTimeoutError(error)
              ? ("timeout" as const)
              : ("failed" as const),
          error: serializeError(error),
        };
      }
      budget.addUsage(agentResult.usage as AgentUsage | undefined);
      machine.transition("evaluating");
      this.#events.emit("evaluation:start", { runId, attempt: index });
      let evaluation: EvaluationResult;
      const evaluator = this.#config.evaluator;
      try {
        evaluation = evaluator
          ? await runOperation((signal) =>
              evaluator.evaluate({
                task: input.task,
                result: agentResult,
                attempt: index,
                ...(signal !== undefined ? { signal } : {}),
              }),
            )
          : { success: agentResult.status === "completed" };
      } catch (error) {
        operationTimedOut ||= isTimeoutError(error);
        evaluation = {
          success: false,
          failures: [
            {
              category:
                runSignal?.aborted || isTimeoutError(error) ? "timeout" : "validation_failure",
              message: error instanceof Error ? error.message : String(error),
              source: evaluator?.id ?? "evaluator",
              retryable: !(runSignal?.aborted || isTimeoutError(error)),
            },
          ],
        };
      }
      this.#events.emit("evaluation:complete", { runId, attempt: index, evaluation });
      const classification = await classifier.classify({
        result: agentResult,
        evaluation,
        attempt: index,
      });
      const failures = classification.failures;
      this.#events.emit("failure:classified", { runId, attempt: index, failures });
      let attempt: AttemptRecord<TResult> = Object.freeze({
        id: randomUUID(),
        runId,
        index,
        startedAt: attemptStartedAt,
        completedAt: new Date().toISOString(),
        agentId: currentAgent.id,
        result: agentResult,
        evaluation,
        failures,
        ...(agentResult.usage !== undefined ? { usage: agentResult.usage } : {}),
        ...(workspaceSnapshot !== undefined ? { workspaceSnapshotId: workspaceSnapshot.id } : {}),
      });
      attempts.push(attempt);

      if (agentResult.status === "completed" && evaluation.success) {
        machine.transition("succeeded");
        this.#events.emit("attempt:complete", { runId, attempt });
        await this.#config.hooks?.afterAttempt?.(attempt);
        return finish("succeeded", agentResult.output);
      }

      machine.transition("failed");
      if (operationTimedOut || !budget.canAttempt()) {
        machine.transition("exhausted");
        this.#events.emit("attempt:complete", { runId, attempt });
        await this.#config.hooks?.afterAttempt?.(attempt);
        return finish("exhausted");
      }

      machine.transition("deciding");
      this.#events.emit("decision:start", { runId, attempt: index });
      const decisionInput = {
        task: input.task,
        attempt,
        history: attempts.slice(0, -1).map(summary),
        failures,
        budget: budget.snapshot(),
        availableAgents: registry.list(),
        policy,
        ...(workspaceSnapshot !== undefined ? { workspace: workspaceSnapshot } : {}),
      };
      let decision: RecoveryDecision;
      let decisionTimedOut = false;
      try {
        decision = await runOperation(() => decisionEngine.decide(decisionInput));
      } catch (error) {
        decisionTimedOut = isTimeoutError(error);
        decision = {
          action: "abort",
          confidence: 1,
          reason: `Decision engine failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      const invalidReason = invalidDecisionReason(
        decision,
        new Set(decisionInput.availableAgents.map((agent) => agent.id)),
      );
      if (invalidReason) {
        decision = { action: "abort", confidence: 1, reason: invalidReason };
      }

      const signature = failureSignature(failures);
      const previousAttempt = attempts.at(-2);
      if (
        signature === lastSignature &&
        decision.action === lastAction &&
        !madeProgress(previousAttempt, attempt)
      )
        consecutiveSame += 1;
      else consecutiveSame = 1;
      lastSignature = signature;
      lastAction = decision.action;
      if (consecutiveSame >= (budgetConfig.maxConsecutiveSameFailure ?? 2)) {
        decision = {
          action: "abort",
          confidence: 1,
          reason: "Unproductive recovery loop detected",
          evidence: failures.map((failure) => failure.message),
        };
      }

      const policyResult = await policy.canExecuteRecovery(decision, decisionInput);
      if (!policyResult.allowed) {
        decision = {
          action: "abort",
          confidence: 1,
          reason: policyResult.reason ?? "Recovery action rejected by policy",
        };
      }
      attempt = Object.freeze({ ...attempt, recoveryDecision: decision });
      attempts[attempts.length - 1] = attempt;
      this.#events.emit("decision:complete", { runId, attempt: index, decision });
      this.#events.emit("attempt:complete", { runId, attempt });
      await this.#config.hooks?.afterAttempt?.(attempt);

      if (decision.action === "abort" || decision.action === "ask_human") {
        const timedOut =
          decisionTimedOut || (runSignal?.aborted && budget.snapshot().reason === "timeout");
        machine.transition(
          timedOut
            ? "exhausted"
            : decision.action === "ask_human"
              ? "waiting_for_human"
              : "aborted",
        );
        if (timedOut) return finish("exhausted");
        if (decision.action === "ask_human") machine.transition("aborted");
        return finish("aborted");
      }

      const strategy = strategies.get(decision.action);
      if (!strategy) {
        machine.transition("aborted");
        return finish("aborted");
      }
      machine.transition("recovering");
      this.#events.emit("recovery:start", { runId, attempt: index, decision });
      await this.#config.hooks?.beforeRecovery?.(decision);
      let recovery: RecoveryExecutionResult;
      try {
        recovery = await runOperation((signal) =>
          strategy.execute({
            decision,
            input: decisionInput,
            ...(recoveryContext !== undefined ? { recoveryContext } : {}),
            ...(this.#config.workspace !== undefined ? { workspace: this.#config.workspace } : {}),
            ...(signal !== undefined ? { signal } : {}),
          }),
        );
      } catch (error) {
        const timedOut =
          isTimeoutError(error) || (runSignal?.aborted && budget.snapshot().reason === "timeout");
        machine.transition(timedOut ? "exhausted" : "aborted");
        return finish(timedOut ? "exhausted" : "aborted");
      }
      this.#events.emit("recovery:complete", { runId, attempt: index, decision });
      await this.#config.hooks?.afterRecovery?.(decision);
      if (!recovery.continue) {
        machine.transition("aborted");
        return finish("aborted");
      }
      recoveryContext = recovery.recoveryContext;
      if (recovery.targetAgent) {
        const selected = registry.get(recovery.targetAgent);
        if (!selected) {
          machine.transition("aborted");
          return finish("aborted");
        }
        currentAgent = selected as AgentAdapter<TTask, TResult>;
      }
      machine.transition("running");
    }

    machine.transition("exhausted");
    return finish("exhausted");
  }
}
