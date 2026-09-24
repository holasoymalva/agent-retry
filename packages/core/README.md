# `agent-retry`

Fault-tolerant recovery runtime for AI agents. It turns failures into structured evidence, applies
bounded policies and budgets, and chooses an explicit recovery action instead of blindly repeating
the same request.

## Install

```bash
pnpm add agent-retry
```

## Quick start

```ts
import { fakeAgent, withRetry } from "agent-retry";

const agent = fakeAgent([
  { status: "failed", error: new Error("temporary failure") },
  { status: "completed", output: "recovered" },
]);

const result = await withRetry(agent, { maxAttempts: 3 }).run({
  task: "Complete the task",
});
```

The runtime supports typed evaluators, recovery decision engines, safety policies, lifecycle events,
workspace snapshots, and time, token, cost, and attempt budgets.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
