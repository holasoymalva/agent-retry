# `@agent-retry/decision-jev`

Optional constrained recovery decisions through a Jev-compatible HTTP endpoint.

## Install

```bash
pnpm add agent-retry @agent-retry/decision-jev
```

## Usage

```ts
import { jevDecisionEngine } from "@agent-retry/decision-jev";

const decisionEngine = jevDecisionEngine({
  apiKey: process.env.JEV_API_KEY!,
  timeoutMs: 10_000,
});
```

Responses are schema-validated before they reach the runtime. Provide a deterministic `fallback`
engine when availability matters.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
