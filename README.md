<div align="center">

# AgentRetry

### The resilience layer for AI agents

**Classify failures. Choose a recovery strategy. Enforce safety. Try again with evidence.**

[![CI](https://github.com/holasoymalva/agent-retry/actions/workflows/ci.yml/badge.svg)](https://github.com/holasoymalva/agent-retry/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-5FA04E.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](tsconfig.base.json)

[Why AgentRetry?](#why-agentretry) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Packages](#packages) · [Roadmap](#roadmap)

</div>

---

AgentRetry is an open-source, provider-independent TypeScript SDK for recovering AI agents from
failure without blindly repeating the same mistake.

It turns every failed attempt into structured evidence, chooses an explicit recovery action, checks
that action against budgets and safety policies, and records the complete recovery history.

```text
Agent attempt → Evaluate → Classify → Decide → Policy check → Recover → Retry
```

> [!IMPORTANT]
> AgentRetry is currently preparing its first `0.1.0` npm release. The API is usable from source,
> but package names and public interfaces may still change before the release is tagged.

## Why AgentRetry?

Most agent retry logic looks like this:

```ts
try {
  return await agent.run(task);
} catch {
  return await agent.run(task);
}
```

That is not recovery. The next attempt receives no evidence, repeats the same strategy, consumes an
unbounded budget, and may make the workspace worse.

AgentRetry treats recovery as a decision problem:

| Failure signal | Possible recovery |
| --- | --- |
| Network error or rate limit | Wait with a bounded delay, then retry |
| Missing context | Add failure evidence to the next attempt |
| Failed tests or validation | Retry with the exact evaluator output |
| Repeated strategy failure | Detect the loop and stop or switch strategy |
| Weak model or incompatible agent | Escalate the model or switch agents |
| Permission or policy violation | Abort safely |
| Destructive workspace change | Roll back only when policy allows it |

Every run is bounded. Every decision is inspectable. Destructive recovery is denied by default.

## Quick start

Until the npm release is available, clone the repository and install the workspace:

```bash
git clone https://github.com/holasoymalva/agent-retry.git
cd agent-retry
pnpm install
pnpm build
```

The public API is designed for the following usage after publication:

```bash
pnpm add agent-retry @agent-retry/adapter-function
```

```ts
import { functionAdapter } from "@agent-retry/adapter-function";
import { withRetry } from "agent-retry";

const agent = functionAdapter(async ({ attempt, recoveryContext }) => {
  if (attempt === 1) {
    throw new Error("temporary network failure");
  }

  console.log(recoveryContext); // evidence and instructions from the failed attempt
  return "done";
});

const resilientAgent = withRetry(agent, {
  maxAttempts: 3,
  timeoutMs: 30_000,
});

const result = await resilientAgent.run({
  task: "Complete the operation",
});

console.log(result.status); // "succeeded"
console.log(result.attempts.length); // 2
```

No provider API key is required. The default classifier and recovery engine are deterministic.

## How it works

```text
┌───────────────┐
│     Task      │
└───────┬───────┘
        ▼
┌───────────────┐    completed     ┌───────────────┐
│ Agent attempt ├─────────────────►│   Evaluator   │
└───────┬───────┘                  └───────┬───────┘
        │ error                              │ failure
        └──────────────────┬─────────────────┘
                           ▼
                  ┌──────────────────┐
                  │ Failure evidence │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Decision engine  │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Policy + budget  │
                  └────────┬─────────┘
                           ▼
             retry · switch · rollback · abort
```

The runtime uses an explicit state machine. Agent execution, evaluation, decision making, and
recovery all share the same cancellation and timeout boundary.

### Recovery actions

```text
retry_same                  retry_with_context
retry_with_modified_instructions
retry_with_stronger_model  switch_agent
wait_and_retry              rollback
reset_workspace             ask_human
abort
```

Every decision includes an action, a concise reason, optional evidence, and confidence metadata.

## Validate the outcome, not just the execution

An agent returning successfully does not mean the task succeeded. Add an evaluator:

```ts
import { commandEvaluator } from "@agent-retry/evaluator-command";

const resilientAgent = withRetry(agent, {
  maxAttempts: 4,
  evaluator: commandEvaluator({
    command: "pnpm",
    args: ["test"],
    cwd: "./repo",
    timeoutMs: 60_000,
  }),
});
```

The command evaluator uses `spawn` with `shell: false`, captures bounded output, and converts test,
build, lint, timeout, and environment failures into structured evidence.

## Deterministic recovery rules

```ts
import { failure, rulesDecisionEngine } from "@agent-retry/decision-rules";

const recovery = rulesDecisionEngine({
  rules: [
    {
      when: failure("rate_limit"),
      decision: { action: "wait_and_retry", delayMs: 1_000 },
    },
    {
      when: failure("permission_error"),
      decision: { action: "abort", reason: "A retry cannot fix authorization." },
    },
    {
      when: failure("missing_context"),
      decision: { action: "retry_with_context" },
    },
  ],
});
```

Deterministic rules can be combined with an intelligent decision provider only for ambiguous
failures. AgentRetry never requires an external model to operate.

## Observable by default

Subscribe to typed lifecycle events without exposing prompts or environment variables:

```ts
resilientAgent.on("decision:complete", ({ attempt, decision }) => {
  console.log({
    attempt,
    action: decision.action,
    reason: decision.reason,
    confidence: decision.confidence,
  });
});
```

Each final result contains immutable attempt records, normalized failures, recovery decisions,
aggregate token usage, estimated cost, timestamps, and terminal status.

## Safety guarantees

- Three attempts by default; unlimited retries are not supported.
- Optional global time, token, and cost budgets.
- Loop detection stops repeated failure/action pairs with no measurable progress.
- Task constraints can tighten runtime policy but cannot weaken it.
- Invalid or unavailable recovery decisions fail closed.
- Destructive workspace actions are denied by the default policy.
- Git restore requires a clean snapshot and explicit `allowRestore: true`.
- Commands execute without a shell.
- Decision-provider summaries omit task input, environment variables, and repository contents.

Read the full [security model](docs/security.md) and [recovery model](docs/recovery-model.md).

## Packages

| Package | Purpose |
| --- | --- |
| [`agent-retry`](packages/core) | Runtime, state machine, budgets, policies, events, evaluators, and built-in strategies |
| [`@agent-retry/adapter-function`](packages/adapter-function) | Wrap any TypeScript function as an agent |
| [`@agent-retry/adapter-ai-sdk`](packages/adapter-ai-sdk) | Provider-neutral adapter for an injected AI SDK generation function |
| [`@agent-retry/decision-rules`](packages/decision-rules) | Deterministic and hybrid recovery decisions |
| [`@agent-retry/decision-jev`](packages/decision-jev) | Optional constrained Jev-compatible decision client |
| [`@agent-retry/evaluator-command`](packages/evaluator-command) | Shell-free command validation with bounded evidence |
| [`@agent-retry/workspace-git`](packages/workspace-git) | Clean-tree Git snapshots, diffs, and explicitly enabled restore |
| [`@agent-retry/cli`](packages/cli) | CLI with Codex command support and structured JSON output |

Provider-specific dependencies stay outside core. A new adapter, evaluator, decision engine, or
recovery strategy can be added without changing the runtime.

## CLI

```bash
agent-retry run \
  --agent codex \
  --eval "pnpm test" \
  --max-attempts 4 \
  "Fix the failing authentication tests"
```

Use `--json` for integrations that need a machine-readable final result.

## Project status

AgentRetry is pre-release software. The recovery primitive and initial integrations are implemented
and covered by 77 automated tests. Core coverage is currently above 92% statements and 83% branches.

What is ready:

- bounded execute → evaluate → classify → decide → recover runtime;
- deterministic and hybrid recovery decisions;
- function and AI SDK-compatible adapters;
- command evaluation and Git workspace safety;
- typed events, hooks, usage accounting, and CLI;
- CI, strict TypeScript, linting, builds, and coverage gates.

## Roadmap

- [ ] Publish the `0.1.0` packages to npm with provenance.
- [ ] Add structured JSON logging with secret redaction.
- [ ] Add OpenTelemetry spans and metrics.
- [ ] Add resumable human approval.
- [ ] Add exponential backoff with jitter and `Retry-After` support.
- [ ] Add Codex, Claude Code, OpenCode, and HTTP adapters.
- [ ] Publish a reproducible naïve-retry vs. AgentRetry benchmark.
- [ ] Add persistence, circuit breakers, and recovery analytics.

See the original [product specification](AGENT_RETRY_SPEC.md) for the complete vision.

## Contributing

AgentRetry is early enough that thoughtful contributors can still shape its public API.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md).
2. Open an issue describing the failure mode or recovery strategy you want to improve.
3. Add deterministic tests for every new recovery path.
4. Run the full verification suite before opening a pull request.

```bash
pnpm install
pnpm build
pnpm test
pnpm test:coverage
pnpm lint
pnpm typecheck
```

Security issues should be reported according to [SECURITY.md](SECURITY.md), not in a public issue.

## Philosophy

```text
retry ≠ recovery
```

AgentRetry does not try to become another agent framework. It exists to make existing agents safer,
more observable, and more capable of recovering from failure.

## License

Licensed under [Apache-2.0](LICENSE).
