# `@agent-retry/adapter-ai-sdk`

Provider-neutral adapter for injecting an AI SDK-compatible generation function into Agent Retry.
The package does not force a provider dependency into the core runtime.

## Install

```bash
pnpm add agent-retry @agent-retry/adapter-ai-sdk
```

## Usage

```ts
import { aiSdkAdapter } from "@agent-retry/adapter-ai-sdk";
import { withRetry } from "agent-retry";

const agent = aiSdkAdapter({
  generate: async ({ task }) => ({
    text: `Completed: ${task}`,
    usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
  }),
});

const result = await withRetry(agent).run({ task: "Explain the failure" });
```

Compatible with injected wrappers around AI SDK generation calls and custom provider clients.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
