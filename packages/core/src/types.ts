/** A task and the context needed to execute it. */
export interface AgentTask<TInput = unknown> {
  readonly id?: string;
  readonly input: TInput;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly context?: AgentContext;
  readonly constraints?: TaskConstraints;
}

/** Per-task limits that can only tighten runtime configuration. */
export interface TaskConstraints {
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
  readonly maxCostUsd?: number;
  readonly maxTokens?: number;
  readonly allowedAgents?: readonly string[];
  readonly deniedAgents?: readonly string[];
  readonly allowedRecoveryActions?: readonly RecoveryAction[];
}

/** Optional non-secret execution context. */
export interface AgentContext {
  readonly workingDirectory?: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly files?: readonly string[];
  readonly instructions?: readonly string[];
  readonly arbitrary?: Readonly<Record<string, unknown>>;
}

/** Serializable representation of an error. */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
}

/** Token and cost accounting reported by an adapter. */
export interface AgentUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number;
}

/** An artifact produced by an agent attempt. */
export interface AgentArtifact {
  readonly type: string;
  readonly name?: string;
  readonly uri?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Context injected by a recovery strategy into the next attempt. */
export interface RecoveryContext {
  readonly additionalContext?: readonly string[];
  readonly instructionPatch?: string;
  readonly model?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Input passed to an agent adapter for one attempt. */
export interface AgentRunInput<TTask = unknown> {
  readonly task: TTask;
  readonly attempt: number;
  readonly previousAttempts: readonly AttemptSummary[];
  readonly recoveryContext?: RecoveryContext;
  readonly signal?: AbortSignal;
}

/** Result returned by an agent adapter. */
export interface AgentRunResult<TResult = unknown> {
  readonly output?: TResult;
  readonly status: "completed" | "failed" | "timeout" | "cancelled";
  readonly error?: SerializedError;
  readonly usage?: AgentUsage;
  readonly artifacts?: readonly AgentArtifact[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Provider-independent agent integration. */
export interface AgentAdapter<TTask = unknown, TResult = unknown> {
  readonly id: string;
  readonly canResume?: boolean;
  run(input: AgentRunInput<TTask>): Promise<AgentRunResult<TResult>>;
  resume?(input: AgentResumeInput): Promise<AgentRunResult<TResult>>;
  cancel?(): Promise<void>;
}

/** Input for adapters that support resuming an interrupted attempt. */
export interface AgentResumeInput {
  readonly attemptId: string;
  readonly signal?: AbortSignal;
  readonly recoveryContext?: RecoveryContext;
}

/** Context passed to an evaluator after an agent attempt. */
export interface EvaluationContext<TResult = unknown> {
  readonly task: AgentTask;
  readonly result: AgentRunResult<TResult>;
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

/** A structured observation produced during evaluation. */
export interface Observation {
  readonly type: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Normalized failure categories. */
export type FailureCategory =
  | "agent_error"
  | "timeout"
  | "tool_error"
  | "permission_error"
  | "rate_limit"
  | "network_error"
  | "validation_failure"
  | "test_failure"
  | "build_failure"
  | "lint_failure"
  | "missing_context"
  | "invalid_output"
  | "dependency_error"
  | "environment_error"
  | "policy_violation"
  | "destructive_change"
  | "unknown";

/** A single piece of normalized failure evidence. */
export interface FailureSignal {
  readonly category: FailureCategory;
  readonly message: string;
  readonly severity?: "low" | "medium" | "high" | "critical";
  readonly retryable?: boolean;
  readonly evidence?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Outcome of validating an agent result. */
export interface EvaluationResult {
  readonly success: boolean;
  readonly score?: number;
  readonly failures?: readonly FailureSignal[];
  readonly observations?: readonly Observation[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Provider-independent output evaluator. */
export interface Evaluator<TResult = unknown> {
  readonly id: string;
  evaluate(context: EvaluationContext<TResult>): Promise<EvaluationResult>;
}

/** Available recovery actions. */
export type RecoveryAction =
  | "retry_same"
  | "retry_with_context"
  | "retry_with_modified_instructions"
  | "retry_with_stronger_model"
  | "switch_agent"
  | "wait_and_retry"
  | "reset_workspace"
  | "rollback"
  | "ask_human"
  | "abort";

/** Explainable recovery choice. */
export interface RecoveryDecision {
  readonly action: RecoveryAction;
  readonly confidence?: number;
  readonly reason?: string;
  readonly evidence?: readonly string[];
  readonly targetAgent?: string;
  readonly targetModel?: string;
  readonly delayMs?: number;
  readonly additionalContext?: readonly string[];
  readonly instructionPatch?: string;
  readonly rollbackToAttempt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Current retry budget and cumulative consumption. */
export interface BudgetSnapshot {
  readonly maxAttempts: number;
  readonly attemptsUsed: number;
  readonly attemptsRemaining: number;
  readonly timeoutMs?: number;
  readonly elapsedMs: number;
  readonly maxCostUsd?: number;
  readonly costUsedUsd: number;
  readonly maxTokens?: number;
  readonly tokensUsed: number;
  readonly exhausted: boolean;
  readonly reason?: "attempts" | "timeout" | "cost" | "tokens";
}

/** Public description of a registered agent. */
export interface AgentDescriptor {
  readonly id: string;
  readonly capabilities?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Minimal immutable workspace snapshot. */
export interface WorkspaceSnapshot {
  readonly id: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Difference between two snapshots. */
export interface WorkspaceDiff {
  readonly summary: string;
  readonly files?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Optional workspace transaction boundary. */
export interface Workspace {
  snapshot(): Promise<WorkspaceSnapshot>;
  restore(snapshot: WorkspaceSnapshot): Promise<void>;
  diff?(from: WorkspaceSnapshot, to: WorkspaceSnapshot): Promise<WorkspaceDiff>;
}

/** Result of a policy check. */
export interface PolicyResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

/** Policy gate that always runs before a recovery action. */
export interface RuntimePolicy {
  canExecuteRecovery(
    decision: RecoveryDecision,
    input: RecoveryDecisionInput,
  ): Promise<PolicyResult>;
}

/** Immutable record of an attempt. */
export interface AttemptRecord<TResult = unknown> {
  readonly id: string;
  readonly runId: string;
  readonly index: number;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly agentId: string;
  readonly model?: string;
  readonly result: AgentRunResult<TResult>;
  readonly evaluation?: EvaluationResult;
  readonly failures?: readonly FailureSignal[];
  readonly recoveryDecision?: RecoveryDecision;
  readonly usage?: AgentUsage;
  readonly workspaceSnapshotId?: string;
}

/** Compact history representation passed to adapters and decision engines. */
export interface AttemptSummary {
  readonly id: string;
  readonly index: number;
  readonly agentId: string;
  readonly status: AgentRunResult["status"];
  readonly failureCategories: readonly FailureCategory[];
  readonly recoveryAction?: RecoveryAction;
}

/** All evidence available to a recovery decision engine. */
export interface RecoveryDecisionInput {
  readonly task: AgentTask;
  readonly attempt: AttemptRecord;
  readonly history: readonly AttemptSummary[];
  readonly failures: readonly FailureSignal[];
  readonly budget: BudgetSnapshot;
  readonly availableAgents: readonly AgentDescriptor[];
  readonly policy: RuntimePolicy;
  readonly workspace?: WorkspaceSnapshot;
}

/** Pluggable recovery decision engine. */
export interface RecoveryDecisionEngine {
  decide(input: RecoveryDecisionInput): Promise<RecoveryDecision>;
}

/** Aggregate usage over an entire run. */
export interface AggregateUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
}

/** Final, fully inspectable run result. */
export interface AgentRetryResult<TResult = unknown> {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "aborted" | "exhausted";
  readonly output?: TResult;
  readonly attempts: readonly AttemptRecord<TResult>[];
  readonly usage: AggregateUsage;
  readonly startedAt: string;
  readonly completedAt: string;
}

/** Valid runtime states. */
export type RunState =
  | "idle"
  | "running"
  | "evaluating"
  | "failed"
  | "deciding"
  | "recovering"
  | "waiting_for_human"
  | "succeeded"
  | "aborted"
  | "exhausted";

/** Retry budget configuration. */
export interface RetryBudgetConfig {
  readonly maxAttempts: number;
  readonly timeoutMs?: number;
  readonly maxCostUsd?: number;
  readonly maxTokens?: number;
  readonly maxConsecutiveSameFailure?: number;
}

/** Recovery strategy execution context. */
export interface RecoveryExecutionContext {
  readonly decision: RecoveryDecision;
  readonly input: RecoveryDecisionInput;
  readonly recoveryContext?: RecoveryContext;
  readonly workspace?: Workspace;
  readonly signal?: AbortSignal;
}

/** Changes a strategy wants applied before the next attempt. */
export interface RecoveryExecutionResult {
  readonly continue: boolean;
  readonly recoveryContext?: RecoveryContext;
  readonly targetAgent?: string;
}

/** Pluggable recovery action implementation. */
export interface RecoveryStrategy {
  readonly action: RecoveryAction;
  execute(context: RecoveryExecutionContext): Promise<RecoveryExecutionResult>;
}

/** Input for deterministic failure classifiers. */
export interface FailureClassifierInput {
  readonly result: AgentRunResult;
  readonly evaluation?: EvaluationResult;
  readonly attempt: number;
}

/** Normalized classifier output. */
export interface FailureClassification {
  readonly failures: readonly FailureSignal[];
}

/** Pluggable failure classifier. */
export interface FailureClassifier {
  classify(input: FailureClassifierInput): Promise<FailureClassification>;
}
