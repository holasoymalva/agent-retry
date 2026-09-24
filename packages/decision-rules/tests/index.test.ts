import { describe, expect, it } from "vitest";
import { failure, hybridDecisionEngine, rulesDecisionEngine } from "../src/index.js";

describe("rulesDecisionEngine", () => {
  it("uses rules in order", async () => {
    const engine = rulesDecisionEngine({
      rules: [{ when: failure("rate_limit"), decision: { action: "wait_and_retry" } }],
    });
    const decision = await engine.decide({
      failures: [{ category: "rate_limit", message: "429" }],
    } as never);
    expect(decision.action).toBe("wait_and_retry");
  });

  it("aborts when no rule matches", async () => {
    const decision = await rulesDecisionEngine({ rules: [] }).decide({} as never);
    expect(decision.action).toBe("abort");
  });

  it("supports computed decisions", async () => {
    const engine = rulesDecisionEngine({
      rules: [
        {
          when: failure("missing_context"),
          decision: (input) => ({
            action: "retry_with_context",
            additionalContext: input.failures.map((item) => item.message),
          }),
        },
      ],
    });
    const decision = await engine.decide({
      failures: [{ category: "missing_context", message: "schema required" }],
    } as never);
    expect(decision.additionalContext).toEqual(["schema required"]);
  });

  it("routes ambiguous failures to an intelligent engine", async () => {
    const deterministic = rulesDecisionEngine({
      rules: [],
      fallback: { action: "retry_same" },
    });
    const intelligent = { decide: async () => ({ action: "ask_human" as const }) };
    const engine = hybridDecisionEngine({
      deterministic,
      intelligent,
      useIntelligentWhen: failure("unknown"),
    });

    await expect(
      engine.decide({ failures: [{ category: "unknown", message: "ambiguous" }] } as never),
    ).resolves.toMatchObject({ action: "ask_human" });
    await expect(
      engine.decide({ failures: [{ category: "network_error", message: "offline" }] } as never),
    ).resolves.toMatchObject({ action: "retry_same" });
  });
});
