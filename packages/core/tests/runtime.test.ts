import { describe, expect, it, vi } from "vitest";
import {
  AllowListPolicy,
  fakeAgent,
  functionEvaluator,
  type RecoveryDecisionEngine,
  withRetry,
} from "../src/index.js";

describe("AgentRetryRuntime", () => {
  it("recovers a transient failure end to end", async () => {
    const agent = fakeAgent([
      { status: "failed", error: new Error("temporary network failure") },
      { status: "completed", output: "done" },
    ]);
    const resilient = withRetry(agent, { maxAttempts: 3 });

    const result = await resilient.run({ task: "example" });

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("done");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.recoveryDecision?.action).toBe("wait_and_retry");
  });

  it("exhausts a bounded run", async () => {
    const agent = fakeAgent([{ status: "failed", error: new Error("temporary failure") }]);
    const result = await withRetry(agent, { maxAttempts: 2 }).run({ task: "example" });

    expect(result.status).toBe("exhausted");
    expect(result.attempts).toHaveLength(2);
  });

  it("uses evaluator evidence and recovery context", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ status: "completed", output: "bad" })
      .mockResolvedValueOnce({ status: "completed", output: "good" });
    const evaluator = functionEvaluator(({ result }) => ({
      success: result.output === "good",
      failures:
        result.output === "good"
          ? []
          : [{ category: "validation_failure", message: "expected good" }],
    }));
    const result = await withRetry({ id: "validator", run }, { evaluator }).run({ task: "x" });

    expect(result.status).toBe("succeeded");
    expect(run.mock.calls[1]?.[0].recoveryContext.additionalContext).toContain("expected good");
  });

  it("allows policy to override a decision", async () => {
    const engine: RecoveryDecisionEngine = {
      decide: async () => ({ action: "reset_workspace", reason: "try reset" }),
    };
    const result = await withRetry(fakeAgent([{ status: "failed", error: new Error("failure") }]), {
      maxAttempts: 3,
      decisionEngine: engine,
      policy: new AllowListPolicy(["retry_same"]),
    }).run({ task: "x" });

    expect(result.status).toBe("aborted");
    expect(result.attempts[0]?.recoveryDecision).toMatchObject({
      action: "abort",
      reason: "Recovery action 'reset_workspace' is not allowed",
    });
  });

  it("emits typed lifecycle events", async () => {
    const resilient = withRetry(fakeAgent([{ status: "completed", output: "ok" }]));
    const events: string[] = [];
    resilient.on("run:start", () => events.push("run:start"));
    resilient.on("run:success", () => events.push("run:success"));

    await resilient.run({ task: "x" });

    expect(events).toEqual(["run:start", "run:success"]);
  });
});
