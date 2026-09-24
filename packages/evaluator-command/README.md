# `@agent-retry/evaluator-command`

Validate agent outcomes with a shell-free command and return bounded, structured evidence.

## Install

```bash
pnpm add @agent-retry/core @agent-retry/evaluator-command
```

## Usage

```ts
import { commandEvaluator } from "@agent-retry/evaluator-command";

const evaluator = commandEvaluator({
  command: "pnpm",
  args: ["test"],
  cwd: "./repo",
  timeoutMs: 60_000,
  maxOutputBytes: 64 * 1024,
});
```

Commands run with `shell: false`. Test, lint, build, timeout, and environment failures are mapped to
normalized Agent Retry failure categories.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
