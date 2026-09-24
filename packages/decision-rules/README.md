# `@agent-retry/decision-rules`

Deterministic and hybrid recovery decisions for Agent Retry.

## Install

```bash
pnpm add @agent-retry/core @agent-retry/decision-rules
```

## Usage

```ts
import { failure, rulesDecisionEngine } from "@agent-retry/decision-rules";

const decisionEngine = rulesDecisionEngine({
  rules: [
    {
      when: failure("rate_limit"),
      decision: { action: "wait_and_retry", delayMs: 1_000 },
    },
    {
      when: failure("permission_error"),
      decision: { action: "abort", reason: "A retry cannot fix authorization." },
    },
  ],
});
```

Rules are evaluated in order. Use `hybridDecisionEngine` to delegate only ambiguous failures to an
intelligent decision provider.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
