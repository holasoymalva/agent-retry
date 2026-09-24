# `@agent-retry/adapter-function`

Wrap any synchronous or asynchronous TypeScript function as an Agent Retry adapter.

## Install

```bash
pnpm add agent-retry @agent-retry/adapter-function
```

## Usage

```ts
import { functionAdapter } from "@agent-retry/adapter-function";
import { withRetry } from "agent-retry";

const agent = functionAdapter(async ({ task }) => {
  return `Completed: ${task}`;
});

const result = await withRetry(agent, { maxAttempts: 3 }).run({
  task: "Generate a migration plan",
});
```

Thrown values are normalized into serializable failures; explicit Agent Retry results pass through
unchanged.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
