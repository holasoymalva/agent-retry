# AgentRetry

Fault tolerance, recovery orchestration, and bounded retry strategies for AI agents.

AgentRetry is a provider-independent TypeScript SDK that turns agent failures into explicit,
observable recovery decisions. It evaluates each attempt, normalizes failure evidence, checks
budgets and policies, and only then executes a recovery strategy.

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer

## Quick start

```bash
pnpm add @agent-retry/core @agent-retry/adapter-function
```

```ts
import { withRetry } from "@agent-retry/core";
import { functionAdapter } from "@agent-retry/adapter-function";

const agent = functionAdapter(async ({ attempt }) => {
  if (attempt === 1) throw new Error("temporary network failure");
  return "done";
});

const result = await withRetry(agent, { maxAttempts: 3 }).run({
  task: "example",
});

console.log(result.status); // succeeded
console.log(result.attempts.length); // 2
```

## Packages

| Package | Purpose |
| --- | --- |
| `@agent-retry/core` | Runtime, types, state machine, budgets, policies, events, built-in strategies |
| `@agent-retry/adapter-function` | Wrap a function as an agent |
| `@agent-retry/adapter-ai-sdk` | Provider-neutral adapter for an injected AI SDK generation function |
| `@agent-retry/decision-rules` | Deterministic and hybrid decision engines |
| `@agent-retry/decision-jev` | Optional constrained Jev-compatible decision client |
| `@agent-retry/evaluator-command` | Shell-free command validation |
| `@agent-retry/workspace-git` | Clean-tree Git snapshots and explicitly enabled restore |
| `@agent-retry/cli` | `agent-retry run` command, including JSON output |

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

See [architecture](docs/architecture.md), [recovery model](docs/recovery-model.md), and
[security](docs/security.md) for design details.

## License

Apache-2.0
