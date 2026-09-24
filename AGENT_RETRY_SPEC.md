# AgentRetry

> Fault tolerance, recovery orchestration, and adaptive retry strategies for AI agents.

## Status

**Project stage:** Specification / MVP implementation plan  
**Primary language:** TypeScript  
**Runtime:** Node.js 22+  
**Package manager:** pnpm  
**License recommendation:** Apache-2.0  
**Primary distribution:** npm + GitHub  
**Primary interface:** TypeScript SDK  
**Secondary interfaces:** CLI, GitHub Action, HTTP service (later)

---

# 1. Executive Summary

AgentRetry is an open-source resilience layer for AI agents.

Its job is **not** to build another coding agent, another chat wrapper, or another generic orchestration framework.

Its job is to answer a much narrower and more valuable question:

> **What should happen when an AI agent fails?**

Modern agents can execute code, call tools, modify repositories, use sandboxes, interact with APIs, and perform long-running workflows. However, failure handling is usually implemented with simplistic retry loops:

```ts
try {
  return await agent.run(task);
} catch {
  return await agent.run(task);
}
```

This is insufficient for production systems.

A failed agent attempt contains useful signals:

- error messages;
- test output;
- partial file changes;
- tool failures;
- timeout information;
- token usage;
- latency;
- previous retries;
- model/harness used;
- confidence;
- sandbox state;
- validation failures;
- policy violations;
- missing context;
- dependency problems.

AgentRetry captures those signals, classifies the failure, chooses an appropriate recovery strategy, applies it, and records the outcome.

The core loop is:

```text
Task
  ↓
Agent attempt
  ↓
Validation / evaluation
  ↓
Success? ─────────────→ YES → return result
  │
  NO
  ↓
Failure normalization
  ↓
Recovery decision
  ↓
Policy / safety checks
  ↓
Recovery action
  ↓
Next attempt
```

Possible recovery actions include:

```text
RETRY_SAME
RETRY_WITH_CONTEXT
RETRY_WITH_STRONGER_MODEL
SWITCH_AGENT
CHANGE_TOOL_STRATEGY
RESET_WORKSPACE
ROLLBACK
ASK_HUMAN
ABORT
```

The long-term goal is to become:

> **The resilience layer for agentic software.**

Conceptually, AgentRetry should play a role similar to:

- circuit breakers for distributed systems;
- retry middleware for HTTP clients;
- job retry policies in queues;
- supervision trees in Erlang;
- transaction recovery in databases;

but applied to AI agents.

---

# 2. Product Vision

## 2.1 Problem

Agent failures are fundamentally different from normal deterministic software failures.

Traditional retry logic assumes that repeating the same request may succeed because the failure is transient.

For AI agents, repeating the same request can:

- produce the same failure;
- produce a completely different failure;
- make destructive changes;
- consume substantial tokens;
- increase cost;
- corrupt a workspace;
- lose important context;
- repeatedly choose the same wrong tool;
- hallucinate fixes;
- create an infinite retry loop.

Therefore:

```text
retry ≠ recovery
```

AgentRetry should model recovery as a decision problem.

A retry strategy should consider:

```text
current state
+ failure type
+ attempt history
+ remaining budget
+ available agents
+ workspace state
+ safety constraints
+ validation result
= next recovery action
```

---

# 3. Core Product Principles

AgentRetry must follow these principles.

## 3.1 Provider agnostic

AgentRetry must never depend on a single model provider.

The same API should work with:

- OpenAI / Codex;
- Anthropic / Claude Code;
- OpenCode;
- custom internal agents;
- Vercel AI SDK agents;
- HTTP-based agents;
- local agents;
- future runtimes.

Provider-specific functionality belongs inside adapters.

---

## 3.2 Decision engine agnostic

Jev is the recommended decision engine for the initial implementation because AgentRetry's recovery problem maps naturally to structured decisions.

However, the core package must expose a generic interface:

```ts
export interface RecoveryDecisionEngine {
  decide(input: RecoveryDecisionInput): Promise<RecoveryDecision>;
}
```

Implementations may include:

```text
JevDecisionEngine
RulesDecisionEngine
LLMDecisionEngine
CustomDecisionEngine
```

The framework must work without Jev.

This enables:

- local/offline testing;
- deterministic CI;
- enterprise policies;
- fallback behavior;
- experimentation.

---

## 3.3 Explicit state machine

Do not hide recovery behavior inside prompts.

Recovery must be represented as explicit states and typed actions.

Bad:

```text
"Please decide what you think is best."
```

Good:

```ts
type RecoveryAction =
  | "retry_same"
  | "retry_with_context"
  | "retry_with_stronger_model"
  | "switch_agent"
  | "reset_workspace"
  | "rollback"
  | "ask_human"
  | "abort";
```

---

## 3.4 Observable by default

Every recovery attempt should generate structured telemetry.

Users must be able to answer:

```text
Why did the agent retry?
Why was another model selected?
Why was execution aborted?
How much did recovery cost?
Which strategy works best?
How many retries usually occur?
```

---

## 3.5 Safe by default

AgentRetry must favor bounded execution.

There must always be:

- a maximum attempt count;
- a maximum time budget;
- an optional cost/token budget;
- action allow/deny lists;
- human escalation support;
- protection from retry loops.

No unlimited retry behavior should be possible by default.

---

## 3.6 Framework, not autonomous product

The MVP is a library.

The first API should feel similar to middleware:

```ts
const resilientAgent = withRetry(agent, {
  maxAttempts: 4,
  decisionEngine: jev(),
  evaluator: testEvaluator(),
});

const result = await resilientAgent.run({
  task: "Fix the failing authentication tests",
});
```

AgentRetry should integrate into existing workflows instead of replacing them.

---

# 4. Primary Use Cases

## 4.1 Coding agents

The initial target market.

Example:

```text
Developer
  ↓
"Fix issue #431"
  ↓
Codex
  ↓
implementation
  ↓
npm test
  ↓
3 failures
  ↓
AgentRetry
  ↓
classifies failure as incomplete implementation
  ↓
adds failed tests to context
  ↓
retries Codex
  ↓
tests pass
```

---

## 4.2 Tool-using agents

Example:

```text
Agent attempts:
create_ticket()

Tool returns:
403 permission denied

AgentRetry classifies:
PERMISSION_ERROR

Decision:
ABORT

Reason:
Retry cannot solve authorization failure.
```

---

## 4.3 Data agents

```text
Agent generates SQL
  ↓
query fails
  ↓
AgentRetry captures database error
  ↓
retry with schema/context
```

---

## 4.4 Browser agents

```text
Agent attempts checkout flow
  ↓
selector not found
  ↓
AgentRetry decides:
refresh state + re-observe page + retry
```

---

## 4.5 Long-running agents

AgentRetry can supervise workflows where individual steps fail and may require:

- replay;
- rollback;
- resume;
- escalation.

---

# 5. Non-Goals

The initial release must NOT attempt to become:

- a full AI agent framework;
- a chat UI;
- a replacement for AI SDK;
- a sandbox provider;
- an LLM gateway;
- an MCP implementation;
- a workflow engine;
- a full observability platform;
- a multi-agent collaboration framework;
- an AI code-review product.

AgentRetry should integrate with these systems.

---

# 6. MVP Definition

Version `0.1.0` should prove one hypothesis:

> A recovery engine that uses execution evidence can recover agent failures more efficiently than naïve retries.

The MVP should support:

1. a generic AgentAdapter interface;
2. one built-in function adapter;
3. a Codex or AI SDK-compatible adapter;
4. deterministic rule-based recovery;
5. Jev recovery decisions;
6. command-based validation;
7. retry budgets;
8. structured attempt history;
9. event hooks;
10. JSON logging;
11. CLI demo;
12. examples repository;
13. comprehensive automated tests.

MVP success means a developer can install:

```bash
pnpm add agent-retry
```

and write:

```ts
import { withRetry } from "agent-retry";

const agent = withRetry(myAgent, {
  maxAttempts: 3,
});

const result = await agent.run({
  task: "Fix the failing tests",
});
```

---

# 7. High-Level Architecture

```text
┌───────────────────────────────────────────┐
│                User App                   │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│             AgentRetry API                │
│                                           │
│ run()                                     │
│ withRetry()                               │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│             Recovery Runtime              │
│                                           │
│ State Machine                             │
│ Budget Manager                            │
│ Attempt History                           │
│ Policy Engine                             │
└──────────┬──────────────┬─────────────────┘
           │              │
           ▼              ▼
┌─────────────────┐   ┌────────────────────┐
│ Agent Adapter   │   │ Evaluator          │
│                 │   │                    │
│ Codex           │   │ tests              │
│ Claude          │   │ build              │
│ AI SDK          │   │ schema             │
│ custom          │   │ custom             │
└────────┬────────┘   └─────────┬──────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
          ┌────────────────────┐
          │ Failure Classifier │
          └─────────┬──────────┘
                    ▼
          ┌────────────────────┐
          │ Decision Engine    │
          │                    │
          │ Rules              │
          │ Jev                │
          │ custom             │
          └─────────┬──────────┘
                    ▼
          ┌────────────────────┐
          │ Recovery Strategy  │
          └─────────┬──────────┘
                    ▼
             next attempt
```

---

# 8. Runtime State Machine

Recommended states:

```ts
type RunState =
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
```

State transitions:

```text
idle
 ↓
running
 ↓
evaluating
 ├─ success ─────────→ succeeded
 │
 └─ failure
      ↓
    failed
      ↓
    deciding
      ↓
   recovering
      ↓
    running
```

Terminal states:

```text
succeeded
aborted
exhausted
```

Human escalation:

```text
deciding
   ↓
waiting_for_human
   ↓
running | aborted
```

State transitions must be validated.

Never allow arbitrary state mutation.

---

# 9. Core Domain Types

## 9.1 Task

```ts
export interface AgentTask<TInput = unknown> {
  id?: string;
  input: TInput;

  metadata?: Record<string, unknown>;

  context?: AgentContext;

  constraints?: TaskConstraints;
}
```

---

## 9.2 Task constraints

```ts
export interface TaskConstraints {
  maxAttempts?: number;
  timeoutMs?: number;
  maxCostUsd?: number;
  maxTokens?: number;

  allowedAgents?: string[];
  deniedAgents?: string[];

  allowedRecoveryActions?: RecoveryAction[];
}
```

---

## 9.3 Agent context

```ts
export interface AgentContext {
  workingDirectory?: string;

  environment?: Record<string, string>;

  files?: string[];

  instructions?: string[];

  arbitrary?: Record<string, unknown>;
}
```

Secrets must not be serialized into telemetry.

---

# 10. Agent Adapter

The core adapter:

```ts
export interface AgentAdapter<
  TTask = unknown,
  TResult = unknown
> {
  readonly id: string;

  run(
    input: AgentRunInput<TTask>
  ): Promise<AgentRunResult<TResult>>;

  canResume?: boolean;

  resume?(
    input: AgentResumeInput
  ): Promise<AgentRunResult<TResult>>;

  cancel?(): Promise<void>;
}
```

Input:

```ts
export interface AgentRunInput<TTask> {
  task: TTask;

  attempt: number;

  previousAttempts: AttemptSummary[];

  recoveryContext?: RecoveryContext;

  signal?: AbortSignal;
}
```

Result:

```ts
export interface AgentRunResult<TResult> {
  output?: TResult;

  status:
    | "completed"
    | "failed"
    | "timeout"
    | "cancelled";

  error?: SerializedError;

  usage?: AgentUsage;

  artifacts?: AgentArtifact[];

  metadata?: Record<string, unknown>;
}
```

---

# 11. Built-In Adapters

Recommended packages:

```text
agent-retry
@agent-retry/adapter-function
@agent-retry/adapter-ai-sdk
@agent-retry/decision-jev
@agent-retry/evaluator-command
@agent-retry/telemetry-otel
@agent-retry/cli
```

Later:

```text
@agent-retry/adapter-codex
@agent-retry/adapter-claude-code
@agent-retry/adapter-opencode
@agent-retry/adapter-http
```

Prefer small packages rather than a monolithic SDK.

---

# 12. Evaluator System

Execution completion does NOT equal success.

The evaluator determines whether the result satisfies the expected outcome.

Interface:

```ts
export interface Evaluator {
  readonly id: string;

  evaluate(
    context: EvaluationContext
  ): Promise<EvaluationResult>;
}
```

Result:

```ts
export interface EvaluationResult {
  success: boolean;

  score?: number;

  failures?: FailureSignal[];

  observations?: Observation[];

  metadata?: Record<string, unknown>;
}
```

---

# 13. Built-In Evaluators

## 13.1 Command evaluator

Run:

```bash
pnpm test
```

or:

```bash
npm run lint
```

Configuration:

```ts
commandEvaluator({
  command: "pnpm",
  args: ["test"],
  cwd: "./repo",
});
```

Produces:

```ts
{
  success: false,
  failures: [
    {
      type: "command_failed",
      message: "3 tests failed",
      evidence: "...",
    }
  ]
}
```

---

## 13.2 Composite evaluator

```ts
compositeEvaluator([
  commandEvaluator("pnpm lint"),
  commandEvaluator("pnpm test"),
  commandEvaluator("pnpm build"),
]);
```

Strategies:

```text
all
any
weighted
```

---

## 13.3 Function evaluator

```ts
functionEvaluator(async ({ result }) => {
  return {
    success: validate(result.output),
  };
});
```

---

## 13.4 Schema evaluator

Useful for structured agents.

Example:

```ts
schemaEvaluator(z.object({
  title: z.string(),
  priority: z.enum(["low", "medium", "high"]),
}));
```

---

# 14. Failure Model

AgentRetry needs a normalized taxonomy.

```ts
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
```

Failure signal:

```ts
export interface FailureSignal {
  category: FailureCategory;

  message: string;

  severity?: "low" | "medium" | "high" | "critical";

  retryable?: boolean;

  evidence?: string;

  source?: string;

  metadata?: Record<string, unknown>;
}
```

---

# 15. Failure Classification

The classifier receives:

```text
agent result
+
evaluator result
+
attempt metadata
```

and returns normalized failures.

Interface:

```ts
export interface FailureClassifier {
  classify(
    input: FailureClassifierInput
  ): Promise<FailureClassification>;
}
```

The default classifier should be deterministic.

Example:

```text
exit code != 0 + output contains "ENOMEM"
→ environment_error

HTTP 429
→ rate_limit

test command exit code 1
→ test_failure
```

Do not use AI where a deterministic classifier is sufficient.

---

# 16. Recovery Actions

Core enum:

```ts
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
```

Each action must be executed by a strategy handler.

---

# 17. Recovery Decision

```ts
export interface RecoveryDecision {
  action: RecoveryAction;

  confidence?: number;

  reason?: string;

  targetAgent?: string;

  targetModel?: string;

  delayMs?: number;

  additionalContext?: string[];

  instructionPatch?: string;

  rollbackToAttempt?: number;

  metadata?: Record<string, unknown>;
}
```

---

# 18. Recovery Decision Input

This is one of the most important structures.

```ts
export interface RecoveryDecisionInput {
  task: AgentTask;

  attempt: AttemptRecord;

  history: AttemptSummary[];

  failures: FailureSignal[];

  budget: BudgetSnapshot;

  availableAgents: AgentDescriptor[];

  policy: RuntimePolicy;

  workspace?: WorkspaceSnapshot;
}
```

The decision engine should receive enough state to make a useful choice but not unnecessary secrets or raw private data.

---

# 19. Jev Decision Engine

Jev should be an optional package:

```text
@agent-retry/decision-jev
```

Conceptual usage:

```ts
import { jevDecisionEngine } from "@agent-retry/decision-jev";

const retry = createAgentRetry({
  decisionEngine: jevDecisionEngine({
    apiKey: process.env.TYPESAFE_API_KEY!,
  }),
});
```

The implementation should ask constrained questions.

Do NOT prompt Jev with:

```text
"What should we do?"
```

Instead, evaluate explicit candidate actions.

Example conceptual request:

```ts
{
  context: summarizeRecoveryState(input),

  questions: [
    {
      type: "choice",
      question: "Which recovery action is most appropriate?",
      choices: [
        "retry_same",
        "retry_with_context",
        "retry_with_stronger_model",
        "switch_agent",
        "ask_human",
        "abort"
      ]
    }
  ]
}
```

The exact transport implementation should be isolated behind a client module so API changes do not affect the runtime.

File:

```text
packages/decision-jev/src/client.ts
```

---

# 20. Deterministic Rules Engine

Never require an external model just to run AgentRetry.

Default:

```ts
rulesDecisionEngine({
  rules: [
    {
      when: failure("rate_limit"),
      action: "wait_and_retry",
    },
    {
      when: failure("permission_error"),
      action: "abort",
    },
    {
      when: failure("missing_context"),
      action: "retry_with_context",
    },
  ],
});
```

Priority:

```text
user rules
↓
safety rules
↓
framework defaults
↓
fallback abort
```

---

# 21. Decision Engine Composition

Allow hybrid strategies:

```ts
hybridDecisionEngine({
  deterministic: rules,
  intelligent: jev,
  useIntelligentWhen: ({ failures }) =>
    failures.some(f => f.category === "unknown")
});
```

This reduces:

- cost;
- latency;
- API dependencies.

---

# 22. Recovery Strategy Handlers

Interface:

```ts
export interface RecoveryStrategy {
  readonly action: RecoveryAction;

  execute(
    context: RecoveryExecutionContext
  ): Promise<RecoveryExecutionResult>;
}
```

---

## 22.1 retry_same

Re-execute the task unchanged.

Use only when failures are likely transient.

Examples:

```text
network errors
temporary provider errors
rate limits after delay
```

---

## 22.2 retry_with_context

Append evidence to the next attempt.

Example:

```text
Previous attempt failed.

Tests:
FAIL auth.test.ts

Expected:
401

Received:
500

Investigate this failure before changing unrelated files.
```

This is likely one of the most useful strategies.

---

## 22.3 retry_with_modified_instructions

Add tactical instructions.

Example:

```text
Do not rewrite the authentication module.
Make the smallest possible change.
```

---

## 22.4 retry_with_stronger_model

The adapter should expose model switching capability when supported.

Example progression:

```text
cheap model
   ↓ failure
stronger model
   ↓ failure
human
```

AgentRetry core should not hardcode model names.

---

## 22.5 switch_agent

Example:

```text
Codex
 ↓ repeated failure
Claude Code
```

Requires an AgentRegistry.

---

# 23. Agent Registry

```ts
export interface AgentRegistry {
  register(agent: AgentAdapter): void;

  get(id: string): AgentAdapter | undefined;

  list(): AgentDescriptor[];
}
```

Descriptor:

```ts
export interface AgentDescriptor {
  id: string;

  capabilities?: string[];

  metadata?: Record<string, unknown>;
}
```

Future metrics:

```text
historical success rate
average cost
average latency
failure patterns
```

This later enables self-optimizing routing.

---

# 24. Retry Budget

Retries must always be bounded.

```ts
export interface RetryBudgetConfig {
  maxAttempts: number;

  timeoutMs?: number;

  maxCostUsd?: number;

  maxTokens?: number;

  maxConsecutiveSameFailure?: number;
}
```

Default:

```ts
{
  maxAttempts: 3,
  maxConsecutiveSameFailure: 2
}
```

---

# 25. Loop Detection

AgentRetry must detect unproductive loops.

Example:

```text
Attempt 1
test_failure(auth.test.ts)

Attempt 2
test_failure(auth.test.ts)

Attempt 3
test_failure(auth.test.ts)
```

The runtime should detect:

```text
same failure signature
+
same recovery action
+
no measurable progress
```

and force:

```text
switch strategy
ask human
or abort
```

Failure signature may be:

```ts
sha256(
  category +
  normalizedMessage +
  affectedFiles
)
```

---

# 26. Progress Detection

A retry that reduces failures is progress.

Example:

```text
Attempt 1:
17 tests failing

Attempt 2:
4 tests failing

Attempt 3:
1 test failing
```

The framework should expose:

```ts
export interface ProgressEvaluator {
  compare(
    previous: AttemptRecord,
    current: AttemptRecord
  ): Promise<ProgressResult>;
}
```

Result:

```ts
{
  progress: "improved",
  score: 0.76
}
```

Possible values:

```text
improved
unchanged
regressed
unknown
```

This becomes an important decision signal.

---

# 27. Attempt Record

Every attempt should be immutable.

```ts
export interface AttemptRecord {
  id: string;

  runId: string;

  index: number;

  startedAt: string;

  completedAt?: string;

  agentId: string;

  model?: string;

  result: AgentRunResult;

  evaluation?: EvaluationResult;

  failures?: FailureSignal[];

  recoveryDecision?: RecoveryDecision;

  usage?: AgentUsage;

  workspaceSnapshotId?: string;
}
```

Never mutate previous attempt records.

---

# 28. Run Result

```ts
export interface AgentRetryResult<TResult = unknown> {
  runId: string;

  status:
    | "succeeded"
    | "failed"
    | "aborted"
    | "exhausted";

  output?: TResult;

  attempts: AttemptRecord[];

  usage: AggregateUsage;

  startedAt: string;

  completedAt: string;
}
```

---

# 29. Public API

Target DX:

```ts
import {
  createAgentRetry,
  commandEvaluator,
} from "agent-retry";

import {
  jevDecisionEngine,
} from "@agent-retry/decision-jev";

const retry = createAgentRetry({
  maxAttempts: 4,

  decisionEngine: jevDecisionEngine(),

  evaluator: commandEvaluator({
    command: "pnpm",
    args: ["test"],
  }),
});

const result = await retry.run({
  task: {
    input: "Fix the failing authentication test",
  },

  agent: myAgent,
});
```

---

# 30. withRetry Convenience API

Common usage should be extremely simple.

```ts
const resilientAgent = withRetry(agent, {
  maxAttempts: 4,
  evaluator,
  decisionEngine,
});

const result = await resilientAgent.run({
  task: "Fix issue #42",
});
```

Users should not need to understand the internal runtime to use AgentRetry.

---

# 31. Event System

Expose lifecycle events:

```text
run:start
attempt:start
attempt:complete
evaluation:start
evaluation:complete
failure:classified
decision:start
decision:complete
recovery:start
recovery:complete
run:success
run:abort
run:exhausted
```

Usage:

```ts
retry.on("decision:complete", event => {
  console.log(event.decision);
});
```

Use typed events.

---

# 32. Hooks

```ts
createAgentRetry({
  hooks: {
    beforeAttempt() {},
    afterAttempt() {},
    beforeRecovery() {},
    afterRecovery() {},
    onSuccess() {},
    onFailure() {},
  },
});
```

Hooks should not mutate internal state directly.

---

# 33. Middleware

Long-term API:

```ts
retry.use(costGuard());
retry.use(secretRedactor());
retry.use(otel());
retry.use(customPolicy());
```

Do not implement a complex middleware engine in the first MVP unless necessary.

Events + hooks are sufficient for `0.1`.

---

# 34. Observability

Every run needs:

```text
run_id
attempt_id
agent_id
model
duration
status
failure_category
recovery_action
token_usage
estimated_cost
progress
```

Example log:

```json
{
  "level": "info",
  "event": "recovery.decision",
  "runId": "run_123",
  "attempt": 2,
  "failure": "test_failure",
  "action": "retry_with_context",
  "confidence": 0.91
}
```

---

# 35. OpenTelemetry

Optional package:

```text
@agent-retry/telemetry-otel
```

Recommended spans:

```text
agent_retry.run
agent_retry.attempt
agent_retry.agent.execute
agent_retry.evaluate
agent_retry.classify
agent_retry.decide
agent_retry.recover
```

Attributes:

```text
agentretry.run.id
agentretry.agent.id
agentretry.attempt.number
agentretry.failure.category
agentretry.recovery.action
agentretry.recovery.confidence
```

Do not store prompts automatically.

---

# 36. Sensitive Data

The telemetry system must support redaction.

```ts
redact({
  keys: [
    "authorization",
    "apiKey",
    "token",
    "password",
  ],
});
```

Default behavior:

```text
DO NOT persist environment variables
DO NOT persist provider API keys
DO NOT persist arbitrary full prompts
DO NOT persist repository contents
```

Users must explicitly opt into full payload logging.

---

# 37. Workspace Abstraction

Coding agents may mutate files.

Define:

```ts
export interface Workspace {
  snapshot(): Promise<WorkspaceSnapshot>;

  restore(snapshot: WorkspaceSnapshot): Promise<void>;

  diff?(
    from: WorkspaceSnapshot,
    to: WorkspaceSnapshot
  ): Promise<WorkspaceDiff>;
}
```

Initial implementation:

```text
GitWorkspace
```

Possible snapshot:

```text
git commit/tree reference
```

---

# 38. Git Workspace Strategy

For local coding agents:

```text
before attempt
↓
create git snapshot
↓
agent modifies repository
↓
evaluate
↓
if destructive failure
↓
restore snapshot
```

Never automatically discard uncommitted user changes.

Require explicit configuration.

Recommended safe mode:

```ts
gitWorkspace({
  requireCleanWorkingTree: true,
});
```

---

# 39. Human-in-the-Loop

Recovery action:

```text
ask_human
```

The runtime emits:

```ts
{
  type: "human_approval_required",
  runId,
  attemptId,
  reason,
  proposedAction
}
```

Possible API:

```ts
const handle = await retry.run(...);

if (handle.status === "waiting_for_human") {
  await handle.resume({
    approved: true,
  });
}
```

This may be postponed to `0.2` if it complicates MVP architecture, but the state model should support it from the beginning.

---

# 40. Policies

Policy engine:

```ts
export interface RuntimePolicy {
  canExecuteRecovery(
    action: RecoveryDecision
  ): Promise<PolicyResult>;
}
```

Example policy:

```ts
{
  "retry_with_stronger_model": true,
  "switch_agent": true,
  "reset_workspace": false,
  "rollback": true
}
```

Policy always overrides AI decisions.

---

# 41. Safety Invariant

An AI decision engine may recommend:

```text
reset_workspace
```

But AgentRetry must execute:

```text
decision
↓
policy validation
↓
strategy execution
```

Never:

```text
AI decision
↓
immediate destructive action
```

---

# 42. Rate Limits

Classify HTTP `429` as:

```text
rate_limit
```

Recovery:

```text
Retry-After header available?
  ↓ yes
wait(header)
  ↓
retry_same
```

Fallback:

```text
exponential backoff + jitter
```

Configuration:

```ts
backoff({
  initialMs: 1000,
  factor: 2,
  maxMs: 30_000,
});
```

---

# 43. Retry Strategy Defaults

Suggested defaults:

| Failure | Default action |
|---|---|
| network_error | wait_and_retry |
| rate_limit | wait_and_retry |
| timeout | retry_same once |
| missing_context | retry_with_context |
| validation_failure | retry_with_context |
| test_failure | retry_with_context |
| build_failure | retry_with_context |
| permission_error | abort |
| policy_violation | abort |
| destructive_change | rollback |
| unknown | intelligent decision / abort |

---

# 44. Circuit Breaker

Future feature but architecture should allow it.

Example:

```text
Provider returns failures 10 times
↓
open circuit
↓
stop using provider temporarily
```

API:

```ts
circuitBreaker({
  failureThreshold: 5,
  resetAfterMs: 60_000,
});
```

---

# 45. Model Escalation

Optional adapter capability:

```ts
export interface ModelAwareAgentAdapter
  extends AgentAdapter {

  availableModels(): Promise<ModelDescriptor[]>;

  setModel(model: string): Promise<void>;
}
```

Strategy:

```text
small model
  ↓
failure
  ↓
medium model
  ↓
failure
  ↓
strong model
```

Do NOT hardcode provider names.

---

# 46. Cost Awareness

Usage model:

```ts
export interface AgentUsage {
  inputTokens?: number;

  outputTokens?: number;

  totalTokens?: number;

  estimatedCostUsd?: number;
}
```

Budget manager checks before next retry.

Example:

```text
remaining budget = $0.03

proposed stronger model estimated = $0.08

→ reject recovery action
→ choose cheaper action / abort
```

---

# 47. Decision Explainability

Every recovery decision should contain:

```text
action
reason
confidence
evidence
```

Example:

```json
{
  "action": "retry_with_context",
  "confidence": 0.92,
  "reason": "The previous attempt produced a correct build but three related tests remain failing.",
  "evidence": [
    "auth.test.ts failed",
    "failure count improved from 11 to 3"
  ]
}
```

Do not expose hidden model reasoning.

The `reason` field should be a concise user-facing justification.

---

# 48. CLI

Package:

```text
@agent-retry/cli
```

Binary:

```bash
agent-retry
```

Example:

```bash
agent-retry run \
  --agent codex \
  --eval "pnpm test" \
  --max-attempts 4 \
  "Fix the failing authentication tests"
```

Output:

```text
AgentRetry

Task:
Fix the failing authentication tests

Attempt 1/4
Agent: codex
Result: failed

Evaluation:
3 tests failing

Decision:
retry_with_context
confidence: 91%

Attempt 2/4
Agent: codex
Result: completed

Evaluation:
✓ 84 tests passed

Recovered after 2 attempts.
```

---

# 49. CLI JSON Mode

Critical for integrations:

```bash
agent-retry run ... --json
```

Returns structured NDJSON events or final JSON.

Never force consumers to parse pretty terminal text.

---

# 50. Configuration File

Optional:

```text
agent-retry.config.ts
```

Example:

```ts
import { defineConfig } from "agent-retry";

export default defineConfig({
  maxAttempts: 4,

  budget: {
    maxCostUsd: 0.5,
    timeoutMs: 15 * 60 * 1000,
  },

  evaluation: {
    command: "pnpm test",
  },

  recovery: {
    engine: "jev",
  },
});
```

---

# 51. Repository Structure

Recommended monorepo:

```text
agent-retry/
│
├── apps/
│   └── docs/
│
├── packages/
│   │
│   ├── core/
│   │   ├── src/
│   │   │   ├── runtime/
│   │   │   ├── state/
│   │   │   ├── budget/
│   │   │   ├── failures/
│   │   │   ├── recovery/
│   │   │   ├── policies/
│   │   │   ├── events/
│   │   │   └── index.ts
│   │   │
│   │   └── tests/
│   │
│   ├── adapter-function/
│   ├── adapter-ai-sdk/
│   ├── decision-rules/
│   ├── decision-jev/
│   ├── evaluator-command/
│   ├── workspace-git/
│   ├── telemetry-otel/
│   └── cli/
│
├── examples/
│   ├── basic/
│   ├── coding-agent/
│   ├── jev/
│   ├── rules/
│   └── custom-agent/
│
├── docs/
│   ├── architecture.md
│   ├── recovery-model.md
│   ├── adapters.md
│   ├── evaluators.md
│   └── security.md
│
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

---

# 52. Technology Stack

## Core

```text
TypeScript
Node.js 22+
pnpm
```

## Monorepo

```text
pnpm workspaces
Turborepo
```

## Validation

```text
Zod
```

Use runtime schemas at public boundaries.

---

## Testing

Recommended:

```text
Vitest
```

Why:

- fast;
- TypeScript-first;
- good mocking;
- simple workspace support.

---

## Formatting / linting

Recommended:

```text
Biome
```

Avoid unnecessary toolchain complexity.

---

## Logging

Recommended:

```text
pino
```

But core should depend on a logger interface.

---

## Telemetry

```text
OpenTelemetry
```

Optional adapter.

---

## CLI

Recommended:

```text
citty
```

or:

```text
commander
```

Keep CLI dependency small.

---

## HTTP

Later:

```text
Hono
```

Only if a server/API package becomes necessary.

---

# 53. Core Dependency Philosophy

`agent-retry` should have very few dependencies.

Ideal:

```text
zod
event system / native EventTarget
```

Avoid forcing users to install:

```text
OpenAI SDK
Anthropic SDK
AI SDK
Jev SDK
OpenTelemetry
```

Those belong in optional packages.

---

# 54. Package Boundaries

Dependency direction:

```text
core
 ↑
 adapters
 ↑
 integrations
 ↑
 applications
```

Never:

```text
core → provider SDK
```

---

# 55. Error Model

Internal errors:

```ts
export class AgentRetryError extends Error {}

export class BudgetExceededError
  extends AgentRetryError {}

export class InvalidStateTransitionError
  extends AgentRetryError {}

export class PolicyDeniedError
  extends AgentRetryError {}

export class AdapterError
  extends AgentRetryError {}

export class EvaluationError
  extends AgentRetryError {}
```

Do not use strings for framework errors.

---

# 56. AbortSignal

Every asynchronous operation should accept cancellation where possible.

```ts
run({
  signal,
});
```

Pass it into:

```text
agent
evaluator
decision engine
recovery action
```

---

# 57. Timeouts

Provide helper:

```ts
withTimeout(operation, timeoutMs)
```

Timeouts should be applied separately to:

```text
agent execution
evaluation
decision
recovery action
```

Global run timeout also exists.

---

# 58. Idempotency

Recovery actions must declare idempotency semantics.

Example:

```ts
export interface RecoveryStrategy {
  idempotent: boolean;
}
```

This matters for:

```text
API calls
database operations
external side effects
```

AgentRetry should not blindly retry non-idempotent actions.

---

# 59. Side-Effect Awareness

Agent adapters may optionally report:

```ts
sideEffects: [
  {
    type: "file_write",
    reversible: true
  },
  {
    type: "external_api",
    reversible: false
  }
]
```

MVP may not fully enforce this, but design types to accommodate it.

---

# 60. Persistence

MVP:

```text
in-memory run store
```

Interface:

```ts
export interface RunStore {
  saveRun(run: RunRecord): Promise<void>;

  saveAttempt(attempt: AttemptRecord): Promise<void>;

  getRun(id: string): Promise<RunRecord | undefined>;
}
```

Future:

```text
SQLiteRunStore
PostgresRunStore
RedisRunStore
```

---

# 61. Deterministic Testing

Every recovery scenario should be reproducible without calling external APIs.

Create:

```text
FakeAgent
FakeEvaluator
FakeDecisionEngine
FakeWorkspace
```

Example:

```ts
const agent = fakeAgent([
  fail("network_error"),
  succeed("ok"),
]);
```

Then assert:

```ts
expect(result.attempts).toHaveLength(2);
```

---

# 62. Test Matrix

At minimum:

## Runtime

```text
success first attempt
success after retry
max attempts exhausted
timeout
manual abort
budget exceeded
```

## Decisions

```text
retry_same
retry_with_context
switch_agent
abort
invalid decision
policy denied
```

## Failures

```text
network
rate limit
permission
tests
build
unknown
```

## Loop prevention

```text
identical failure repeated
identical strategy repeated
progress despite repeated category
```

## Workspace

```text
snapshot
rollback
dirty working tree protection
```

---

# 63. Property Tests

Useful invariants:

```text
attempt count never exceeds maxAttempts

terminal run never returns to running

budget never becomes negative without terminating

policy-denied actions never execute

attempt history is immutable

run always reaches a terminal state unless waiting for human
```

Consider `fast-check`.

---

# 64. Integration Tests

Provide opt-in tests:

```text
TEST_JEV=true
TEST_OPENAI=true
TEST_AI_SDK=true
```

CI should not require provider credentials for core test suite.

---

# 65. CI

GitHub Actions:

```text
install
lint
typecheck
unit tests
integration tests without external services
build
package validation
```

Node versions:

```text
22
24
```

---

# 66. Release

Recommended:

```text
Changesets
GitHub Actions
npm provenance
```

Packages:

```text
agent-retry
@agent-retry/decision-jev
...
```

Meta package later:

```text
agent-retry
```

---

# 67. Documentation Strategy

README should answer in the first screen:

```text
What problem does this solve?
How do I install it?
How do I retry an agent?
```

Avoid starting with architecture.

Hero example:

```ts
const agent = withRetry(codex, {
  maxAttempts: 3,
  evaluate: "pnpm test",
});

await agent.run("Fix the failing tests");
```

---

# 68. Example README Pitch

```text
# AgentRetry

Fault tolerance for AI agents.

AI agents fail differently from normal software.
Repeating the same prompt is not a recovery strategy.

AgentRetry observes failed attempts, evaluates what went wrong,
and chooses how to recover:

- retry with failure context
- switch models
- switch agents
- rollback
- wait and retry
- escalate to a human
- abort safely
```

---

# 69. Demo Scenario

Build one excellent demo rather than ten mediocre examples.

Repository:

```text
examples/broken-todo-app
```

Intentional bug:

```text
pagination endpoint fails 4 tests
```

Demo:

```bash
pnpm demo
```

Flow:

```text
Attempt 1:
agent modifies controller

Tests:
4 → 2 failures

AgentRetry:
progress detected
retry_with_context

Attempt 2:
agent fixes edge case

Tests:
all pass

SUCCESS
```

Show before/after terminal output.

This demo should be usable in:

```text
README GIF
X/Twitter demo
LinkedIn
Hacker News
Reddit
Dev.to
```

---

# 70. Benchmark Harness

Create:

```text
benchmarks/
```

Metrics:

```text
recovery rate
average attempts
token usage
cost
latency
```

Compare:

```text
No retry
Naive retry
AgentRetry rules
AgentRetry + Jev
```

This is important.

AgentRetry's value should be measurable.

---

# 71. Benchmark Dataset

Start with synthetic but realistic failures:

```text
network transient
missing file context
incorrect test interpretation
dependency install failure
formatting failure
timeout
invalid structured output
wrong tool selection
```

Later open-source a standard:

```text
Agent Recovery Benchmark
```

This itself could become strategically valuable.

---

# 72. Metrics

Primary product metrics:

```text
recovery_success_rate

average_attempts_to_success

cost_per_success

time_to_success

abort_rate

human_escalation_rate
```

Secondary:

```text
strategy_success_rate

failure_frequency_by_category

agent_success_rate

model_success_rate
```

---

# 73. Learning Layer

Do NOT implement adaptive learning in MVP.

But structure data so future versions can answer:

```text
For this repository:
retry_with_context succeeds 78% of the time.

For test failures:
Claude succeeds more often than Codex.

For network failures:
retry_same succeeds 96%.

For auth failures:
switch_agent wastes money.
```

This enables:

```text
AgentRetry Intelligence
```

later.

---

# 74. Future Adaptive Recovery

Future decision input can include:

```ts
historicalPerformance: {
  actionSuccessRates: {},
  agentSuccessRates: {},
  failureRecoveryRates: {},
}
```

Then recovery becomes personalized.

---

# 75. AgentRetry Cloud

Do not build initially.

Future hosted product:

```text
AgentRetry Cloud
```

Provides:

```text
dashboards
shared policies
recovery analytics
team benchmarks
managed decision engine
cross-repository intelligence
alerts
enterprise audit trail
```

Open source:

```text
runtime
SDK
adapters
```

Paid:

```text
analytics
governance
history
cross-team learning
enterprise controls
```

---

# 76. GitHub Integration

Future GitHub App:

```text
Issue
 ↓
coding agent
 ↓
AgentRetry
 ↓
PR
 ↓
tests fail
 ↓
automatic recovery
 ↓
PR updated
```

GitHub Check output:

```text
AgentRetry

Recovered after 2 attempts.

Attempt 1
❌ 3 tests failed

Recovery
↻ retry_with_context

Attempt 2
✅ 91 tests passed
```

---

# 77. Temporal Integration

Future integration:

```text
Temporal Workflow
  ↓
AgentRetry activity
```

AgentRetry should not compete with Temporal.

Temporal manages durable workflow execution.

AgentRetry manages semantic agent recovery.

These are complementary.

---

# 78. MCP Integration

Future:

AgentRetry can supervise tool calls exposed through MCP.

Example:

```text
agent
 ↓
MCP tool
 ↓
failure
 ↓
AgentRetry classification
 ↓
retry / alternate tool / abort
```

Do not implement MCP transport in MVP.

---

# 79. AI SDK Integration

Recommended early adapter because a unified agent abstraction reduces provider coupling.

Pseudo implementation:

```ts
export function aiSdkAgentAdapter(agent): AgentAdapter {
  return {
    id: "ai-sdk",

    async run({ task, signal }) {
      try {
        const result = await agent.generate({
          prompt: String(task),
          abortSignal: signal,
        });

        return {
          status: "completed",
          output: result,
        };
      } catch (error) {
        return {
          status: "failed",
          error: serializeError(error),
        };
      }
    },
  };
}
```

Verify exact runtime APIs against the installed AI SDK version during implementation.

---

# 80. Codex Integration

Prefer one of:

```text
AI SDK Harness adapter
OpenAI Agents API
custom adapter
```

Core must not assume how Codex is executed.

Example conceptual adapter:

```ts
const codex = createCodexAdapter({
  sandbox,
  instructions,
});
```

AgentRetry sees only:

```ts
AgentAdapter
```

---

# 81. Decision Provider Reliability

What if Jev is unavailable?

The decision layer itself can fail.

Fallback chain:

```text
Jev
 ↓ failure
rules engine
 ↓
safe default
```

Safe default:

```text
abort
```

Never make recovery availability depend on a single external service.

---

# 82. Meta-Retry

Do NOT recursively AgentRetry the AgentRetry decision engine.

Instead use simple provider retry logic:

```text
network retry ≤ 2
timeout
fallback
```

Avoid recursive resilience complexity.

---

# 83. Configuration Precedence

Recommended:

```text
task constraints
↓
runtime config
↓
project config
↓
library defaults
```

Policies cannot be weakened by lower-trust layers.

Example:

```text
organization policy denies destructive reset
```

Task config cannot override it.

---

# 84. Recovery Context Generation

For retry_with_context, avoid dumping all history.

Build a concise context:

```text
ATTEMPT 1 FAILED

Failure:
3 tests failed in auth.test.ts

Observed:
- login() returns 500 instead of 401
- build passes
- lint passes

Previous modifications:
- src/auth/service.ts

Do not repeat previous unsuccessful implementation.
Focus on the failing behavior.
```

This reduces token waste.

---

# 85. History Compaction

After many retries:

```text
attempt 1
attempt 2
attempt 3
...
```

Do not append raw full outputs indefinitely.

Create:

```ts
AttemptSummary
```

Example:

```ts
{
  index: 2,
  failureCategories: ["test_failure"],
  recoveryAction: "retry_with_context",
  progress: "improved"
}
```

---

# 86. Structured Evidence

Prefer:

```ts
{
  command: "pnpm test",
  exitCode: 1,
  failingTests: [
    "auth rejects expired token"
  ]
}
```

over massive text logs.

Adapters/evaluators may additionally include truncated raw output.

---

# 87. Output Limits

Every captured string should have configurable maximum size.

Example:

```text
maxCommandOutputBytes = 100_000
maxErrorMessageBytes = 20_000
```

Avoid memory explosions.

---

# 88. Concurrency

MVP:

```text
one run → sequential attempts
```

Do not implement parallel recovery initially.

Future:

```text
fork recovery
 ├ Claude attempt
 └ Codex attempt
     ↓
 evaluator
     ↓
 choose best
```

This could become `speculative recovery`.

---

# 89. Speculative Recovery

Future high-value feature.

Instead of:

```text
agent A
↓
fail
↓
agent B
```

run:

```text
failure
 ↓
┌───────────────┐
│ parallel fork │
├───────┬───────┤
│Claude │Codex  │
└───┬───┴───┬───┘
    ↓       ↓
 validation
    ↓
 best result
```

Useful when latency matters more than cost.

---

# 90. Recovery Trees

Future:

```text
failure
├ retry same
│  └ fail
├ add context
│  └ fail
└ switch agent
   └ success
```

Store this as structured data.

Eventually compare strategy trees.

---

# 91. Plugin System

Do not prematurely design a complex plugin API.

Interfaces already provide extension points:

```text
AgentAdapter
Evaluator
FailureClassifier
RecoveryDecisionEngine
RecoveryStrategy
RunStore
Workspace
Logger
```

That is enough.

---

# 92. Semantic Versioning

Before `1.0`:

```text
0.1 core runtime
0.2 adapters + human escalation
0.3 persistence + telemetry
0.4 benchmarks + GitHub Action
0.5 adaptive metrics
```

Do not promise API stability until `1.0`.

---

# 93. Implementation Phases

## Phase 0 — repository foundation

Implement:

```text
pnpm workspace
Turborepo
TypeScript
Vitest
Biome
Changesets
GitHub Actions
```

Deliverable:

```text
all packages build
tests run
CI green
```

---

## Phase 1 — core runtime

Implement:

```text
AgentAdapter
Evaluator
RecoveryDecisionEngine
RecoveryStrategy
AttemptRecord
RunResult
BudgetManager
state machine
events
```

No external AI.

Goal:

```text
fake agent fails then succeeds
```

---

## Phase 2 — deterministic recovery

Implement:

```text
rules decision engine
failure classifier
retry_same
retry_with_context
wait_and_retry
abort
loop detection
```

Goal:

```text
deterministic recovery test suite
```

---

## Phase 3 — command evaluator

Implement:

```text
spawn command
capture stdout/stderr
timeout
exit code
structured result
```

Goal:

```text
coding demo can evaluate real tests
```

---

## Phase 4 — Jev

Implement optional package:

```text
decision-jev
```

Requirements:

```text
typed request
typed response
timeout
fallback support
redaction
tests with mocked HTTP
```

Goal:

```text
Jev chooses constrained recovery action
```

---

## Phase 5 — AI SDK adapter

Implement:

```text
adapter-ai-sdk
```

Goal:

```text
real coding agent can be wrapped with AgentRetry
```

---

## Phase 6 — Git workspace

Implement:

```text
workspace-git
```

Requirements:

```text
clean-tree detection
snapshots
restore
diff
safe rollback
```

---

## Phase 7 — CLI

Implement:

```text
run
--agent
--eval
--max-attempts
--json
```

Goal:

```text
one-command demo
```

---

## Phase 8 — docs/demo

Deliver:

```text
excellent README
architecture docs
demo repository
terminal recording
benchmark
```

---

# 94. Initial Codex Tasks

Execute in this order.

## Task 1

Create the monorepo foundation.

Acceptance:

```text
pnpm install
pnpm build
pnpm test
pnpm lint
```

all succeed.

---

## Task 2

Implement core domain types.

Files:

```text
packages/core/src/types/
```

Do not implement runtime yet.

---

## Task 3

Implement runtime state machine.

Requirements:

```text
typed states
validated transitions
terminal-state protection
unit tests
```

---

## Task 4

Implement AgentRetryRuntime.

Flow:

```text
execute
evaluate
classify
decide
recover
repeat
```

---

## Task 5

Implement fake testing utilities.

This allows every later feature to be tested deterministically.

---

## Task 6

Implement retry budget.

Test all termination conditions.

---

## Task 7

Implement rules engine.

No network dependencies.

---

## Task 8

Implement command evaluator.

Use Node child_process spawn.

Do not use `exec` for arbitrary commands if avoidable.

---

## Task 9

Implement Jev decision adapter.

Keep HTTP client isolated.

---

## Task 10

Implement public convenience API.

Target:

```ts
withRetry(agent, config)
```

---

# 95. Code Quality Requirements

Every public export must:

```text
have TypeScript types
have JSDoc
have tests
avoid any
```

Compiler:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

---

# 96. No Hidden Magic

Avoid APIs where prompts silently determine control flow.

Control flow should always be inspectable in TypeScript.

AI may choose among allowed decisions.

AI does not define the runtime.

---

# 97. Dependency Injection

Core runtime constructor:

```ts
createAgentRetry({
  decisionEngine,
  evaluator,
  classifier,
  policies,
  runStore,
  logger,
});
```

Avoid global state.

---

# 98. Pure Functions

Whenever possible:

```text
failure normalization
budget calculation
state transition
loop detection
decision validation
```

should be pure functions.

This makes the library reliable.

---

# 99. Security Checklist

Before publishing:

```text
[ ] no API keys in logs
[ ] no environment dumps
[ ] command evaluator avoids shell=true by default
[ ] workspace rollback cannot escape configured directory
[ ] paths normalized
[ ] symlink behavior reviewed
[ ] output truncated
[ ] dangerous recovery strategies policy-gated
[ ] network timeouts
[ ] abort signals propagated
[ ] package provenance
[ ] dependency audit
```

---

# 100. Command Evaluator Security

Bad:

```ts
exec(`cd ${cwd} && ${command}`);
```

Preferred:

```ts
spawn(binary, args, {
  cwd,
  shell: false,
});
```

If shell mode is supported later, make it explicit:

```ts
shell: true
```

and document risk.

---

# 101. Threat Model

Potential threats:

```text
malicious repository content
prompt injection
agent-generated destructive commands
secret exposure
workspace escape
infinite retries
denial of wallet
provider outage
malicious tool output
```

Mitigations:

```text
bounded budgets
policy layer
redaction
sandbox support
workspace restrictions
timeouts
manual approval
provider fallback
```

---

# 102. Denial of Wallet Protection

This is a core differentiator.

Always support:

```text
maxAttempts
maxTokens
maxCostUsd
timeoutMs
```

When unknown cost:

```text
treat cost budget as advisory
```

Token/attempt/time limits remain authoritative.

---

# 103. Default Behavior Philosophy

When uncertain:

```text
fail closed
```

Examples:

```text
unknown destructive action → deny

invalid recovery decision → abort

decision provider unavailable + no rules → abort

budget unknown after limit reached → abort
```

---

# 104. Example: Network Recovery

```text
Attempt 1

Agent:
HTTP request

Failure:
ECONNRESET

Classification:
network_error

Decision:
wait_and_retry

Delay:
1000 ms

Attempt 2

Success
```

---

# 105. Example: Missing Context

```text
Attempt 1

Agent writes implementation.

Tests fail:

TypeError:
UserRepository.findActive is not a function

Classifier:
missing_context

Decision:
retry_with_context

Added context:
"Inspect UserRepository API before editing the service."

Attempt 2:
success
```

---

# 106. Example: Repeated Bad Strategy

```text
Attempt 1:
7 tests fail

retry_with_context

Attempt 2:
7 same tests fail

Loop detector:
same failure signature

Decision override:
switch_agent

Attempt 3:
tests pass
```

---

# 107. Example: Permission Error

```text
Attempt 1

GitHub API:
403

Classification:
permission_error

Decision:
abort

Reason:
Retry cannot resolve missing permission.
```

This saves cost.

---

# 108. Example: Cost Escalation

```text
Attempt 1:
cheap agent

Failure:
complex reasoning problem

Decision:
retry_with_stronger_model

BudgetManager:
remaining $0.40

estimated retry:
$0.12

Approved.

Attempt 2:
success.
```

---

# 109. Example: Budget Rejection

```text
remaining:
$0.02

decision:
retry_with_stronger_model

estimated:
$0.10

Policy:
DENY

Fallback:
abort
```

---

# 110. Recovery Decision Validation

Before strategy execution:

```text
Is action known?
Is action allowed?
Is target agent available?
Is model supported?
Is budget sufficient?
Is action safe?
Would it exceed attempts?
```

Only then execute.

---

# 111. Result Semantics

Differentiate:

```text
agent completed
```

from:

```text
task succeeded
```

This distinction should appear throughout the codebase.

---

# 112. Public Terminology

Use consistently:

```text
Run
Attempt
Evaluation
Failure
Decision
Recovery
Strategy
Budget
Policy
Workspace
```

Avoid synonyms that cause API confusion.

---

# 113. Naming

Recommended package/project:

```text
AgentRetry
```

npm availability must be checked before publishing.

Possible npm namespace:

```text
@agent-retry/*
```

Tagline:

```text
Fault tolerance for AI agents.
```

Alternative:

```text
Recovery orchestration for AI agents.
```

---

# 114. Logo / Visual Identity

Not an MVP requirement.

Concept:

```text
↻ + agent spark
```

Avoid generic robot-head logos.

Brand should communicate infrastructure/reliability.

---

# 115. GitHub Topics

Use:

```text
ai
agents
ai-agents
agentic-ai
resilience
retry
fault-tolerance
typescript
codex
claude
developer-tools
```

---

# 116. README Sections

Recommended order:

```text
Hero
Problem
Install
30-second example
How it works
Recovery strategies
Adapters
Jev integration
Safety
Observability
Benchmarks
Architecture
Roadmap
Contributing
License
```

---

# 117. Minimum Public Demo

Developer runs:

```bash
git clone ...
cd examples/broken-app
pnpm demo
```

Sees:

```text
Attempt 1
❌ tests failed

Recovery:
retry_with_context

Attempt 2
✅ all tests passed
```

If this experience is not excellent, do not launch yet.

---

# 118. Launch Criteria

`0.1.0` is ready when:

```text
[ ] installable from npm
[ ] Node 22+
[ ] documented public API
[ ] deterministic rules engine
[ ] Jev integration
[ ] command evaluator
[ ] budget enforcement
[ ] loop protection
[ ] JSON logs/events
[ ] ≥ 90% meaningful core coverage
[ ] zero external APIs required for tests
[ ] demo works from clean clone
[ ] CI green
[ ] security docs
```

Coverage percentage alone is not sufficient.

Focus on state/recovery branch coverage.

---

# 119. Performance Targets

Core overhead excluding external calls:

```text
< 10 ms per state transition/recovery calculation
```

Memory:

```text
attempt histories bounded
large logs truncated
```

Agent execution will dominate latency.

AgentRetry itself should be lightweight.

---

# 120. Compatibility

Initial:

```text
Node.js 22+
ESM
TypeScript
```

Consider dual-package CJS only if real demand exists.

Prefer ESM-first.

---

# 121. API Stability Strategy

Keep implementation details internal.

Public exports should be intentionally small.

Example:

```ts
export {
  createAgentRetry,
  withRetry,
  defineConfig,
};

export type {
  AgentAdapter,
  Evaluator,
  RecoveryDecisionEngine,
  RecoveryStrategy,
  AgentRetryResult,
};
```

Do not export every internal helper.

---

# 122. Architecture Decision Records

Create:

```text
docs/adr/
```

Initial ADRs:

```text
0001-typescript.md
0002-provider-agnostic-core.md
0003-explicit-state-machine.md
0004-optional-jev.md
0005-policy-before-recovery.md
0006-attempt-immutability.md
```

This helps contributors understand intentional constraints.

---

# 123. Contribution Guidelines

Require:

```text
issue / rationale
tests
changeset
docs for public API
```

New adapters must not add dependencies to core.

---

# 124. What NOT to Build in the First Month

Avoid:

```text
dashboard
auth
billing
hosted SaaS
database cluster
vector database
browser UI
multi-user workspace
custom model training
large plugin marketplace
```

The open-source runtime must prove value first.

---

# 125. 30-Day Roadmap

## Week 1

```text
core
rules
fake agents
tests
```

## Week 2

```text
command evaluator
Jev
AI SDK adapter
```

## Week 3

```text
Git workspace
CLI
demo
benchmarks
```

## Week 4

```text
docs
polish
npm
launch
feedback
```

---

# 126. Post-MVP Roadmap

## 0.2

```text
human approvals
persistent run stores
Claude/Codex dedicated examples
```

## 0.3

```text
OpenTelemetry
GitHub Action
recovery dashboards via exported telemetry
```

## 0.4

```text
historical recovery metrics
adaptive strategy selection
```

## 0.5

```text
speculative parallel recovery
recovery trees
```

## 1.0

```text
stable extension API
enterprise-safe policies
production hardening
```

---

# 127. Long-Term Moat

The code itself is not the strongest moat.

The moat can become the dataset:

```text
failure
→ recovery action
→ outcome
```

Across thousands/millions of agent executions.

That enables learning:

```text
Which recovery action works?
For which failure?
For which agent?
For which codebase?
At what cost?
```

This eventually makes AgentRetry much smarter than static retry middleware.

---

# 128. Long-Term Product Evolution

```text
AgentRetry
   │
   ├── Runtime
   │
   ├── Recovery Policies
   │
   ├── Agent Adapters
   │
   ├── Evaluation
   │
   ├── Telemetry
   │
   └── Historical Intelligence
```

Possible future product:

```text
Agent Reliability Platform
```

covering:

```text
retry
fallback
routing
recovery
evaluation
circuit breaking
budget control
escalation
incident analysis
```

---

# 129. Core Differentiator

The README and implementation should continuously reinforce:

```text
Normal retry libraries retry requests.

AgentRetry reasons about failures
and changes the recovery strategy.
```

That is the project.

Do not dilute it.

---

# 130. Codex Implementation Instruction

Use this document as the source of truth.

When implementing:

1. Start with the smallest coherent core.
2. Keep provider-specific dependencies outside core.
3. Prefer deterministic logic where possible.
4. Use AI only for ambiguous recovery decisions.
5. Enforce budgets and policies before executing recovery.
6. Never implement unbounded retries.
7. Keep all attempts immutable.
8. Make control flow observable.
9. Write tests before integrating real providers.
10. Do not expand product scope unless required by this specification.

When the specification leaves an implementation choice open:

- prefer the simpler design;
- preserve extensibility through interfaces;
- avoid premature abstractions;
- document the decision in an ADR if it affects public architecture.

---

# 131. First Implementation Goal

The very first end-to-end milestone must be:

```ts
const agent = fakeAgent([
  {
    status: "failed",
    error: new Error("temporary network failure"),
  },
  {
    status: "completed",
    output: "done",
  },
]);

const resilient = withRetry(agent, {
  maxAttempts: 3,
});

const result = await resilient.run({
  task: "example",
});

expect(result.status).toBe("succeeded");
expect(result.attempts).toHaveLength(2);
```

Once this works through the real runtime/state machine, build upward.

Do not begin with Jev, Codex, CLI, dashboards, or external providers.

Build the recovery primitive first.

---

# 132. Definition of Done for the Architecture

The architecture is correct when:

```text
a new agent provider can be added without editing core

a new evaluator can be added without editing runtime

Jev can disappear and AgentRetry still works

recovery actions are bounded by policy

runs cannot retry forever

every recovery action can be explained

every attempt can be inspected

tests can reproduce all recovery paths without network access
```

If any of these are false, refactor before expanding the project.

---

# 133. Final Product Statement

AgentRetry should eventually allow developers to write:

```ts
const agent = withRetry(codex, {
  evaluator: tests("pnpm test"),
  recovery: jev(),
  maxAttempts: 4,
  maxCostUsd: 0.5,
});

await agent.run("Fix issue #431");
```

and trust that when the agent fails, the system will not blindly repeat the same mistake.

It will:

```text
observe
classify
decide
recover
validate
learn
```

That is the complete vision of AgentRetry.

---

# Appendix A — Recommended Initial Dependencies

Core:

```text
typescript
zod
```

Dev:

```text
vitest
@vitest/coverage-v8
biome
tsup or tsdown
changesets
turbo
```

Optional packages:

```text
AI SDK integration
OpenTelemetry integration
provider SDKs
```

Before installing dependencies, verify their current package names and supported Node versions.

---

# Appendix B — Recommended Environment Variables

Optional integrations:

```bash
TYPESAFE_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Never require any provider key for core operation.

---

# Appendix C — Suggested npm Scripts

Root:

```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean",
    "changeset": "changeset",
    "release": "changeset publish"
  }
}
```

---

# Appendix D — Suggested Branch Strategy

Keep simple:

```text
main
feature/*
fix/*
```

Use pull requests.

Do not introduce GitFlow.

---

# Appendix E — Suggested Commit Convention

Optional:

```text
feat(core):
fix(runtime):
feat(jev):
test(core):
docs:
chore:
```

Useful for changelog quality.

---

# Appendix F — Future Research Questions

Keep a project issue/discussion for:

1. Which failure taxonomy generalizes best across agent runtimes?
2. When is a stronger model more effective than additional context?
3. When should AgentRetry switch agents instead of models?
4. How should progress be measured for non-coding tasks?
5. Can recovery success be predicted cheaply?
6. How should recovery decisions adapt to individual repositories?
7. What signals best detect repeated semantic failures?
8. When is speculative parallel recovery cheaper than sequential retry?
9. Which recovery outcomes are safe to learn across users?
10. Can an open Agent Recovery Benchmark become a useful ecosystem standard?

---

# Appendix G — Product North Star

If a developer ever says:

> "My agent failed, so I just ran it again."

AgentRetry should make that feel as primitive as retrying a failed distributed request without:

- exponential backoff;
- circuit breakers;
- idempotency;
- observability;
- budgets;
- failure classification.

The project succeeds when intelligent recovery becomes a standard primitive of agentic software.
