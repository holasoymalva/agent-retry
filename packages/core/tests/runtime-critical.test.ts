import { describe, expect, it, vi } from "vitest";
import {
  AllowListPolicy,
  fakeAgent,
  functionEvaluator,
  type RecoveryDecisionEngine,
  type Workspace,
  withRetry,
} from "../src/index.js";

const retrySame: RecoveryDecisionEngine = {
  decide: async () => ({ action: "retry_same", reason: "retry for test" }),
};

describe("critical runtime paths", () => {
  it("succeeds on the first attempt and aggregates usage", async () => {
    const result = await withRetry(
      fakeAgent([
        {
          status: "completed",
          output: "ok",
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, estimatedCostUsd: 0.01 },
        },
      ]),
    ).run({ task: "x" });

    expect(result).toMatchObject({
      status: "succeeded",
      output: "ok",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, estimatedCostUsd: 0.01 },
    });
    expect(Object.isFrozen(result.attempts[0])).toBe(true);
  });

  it("switches to an available agent", async () => {
    const primary = fakeAgent([{ status: "failed", error: new Error("bad strategy") }], "primary");
    const secondary = fakeAgent([{ status: "completed", output: "recovered" }], "secondary");
    const decisionEngine: RecoveryDecisionEngine = {
      decide: async () => ({ action: "switch_agent", targetAgent: "secondary" }),
    };

    const result = await withRetry(primary, {
      agents: [secondary],
      decisionEngine,
      maxAttempts: 3,
    }).run({ task: "x" });

    expect(result.status).toBe("succeeded");
    expect(result.attempts.map((attempt) => attempt.agentId)).toEqual(["primary", "secondary"]);
  });

  it("passes a stronger model to the next attempt", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", error: { name: "Error", message: "weak" } })
      .mockResolvedValueOnce({ status: "completed", output: "strong" });
    const decisionEngine: RecoveryDecisionEngine = {
      decide: async () => ({
        action: "retry_with_stronger_model",
        targetModel: "strong-model",
      }),
    };

    const result = await withRetry({ id: "model-aware", run }, { decisionEngine }).run({
      task: "x",
    });

    expect(result.status).toBe("succeeded");
    expect(run.mock.calls[1]?.[0].recoveryContext.model).toBe("strong-model");
  });

  it("restores a workspace snapshot before retrying", async () => {
    const snapshot = { id: "snapshot-1", createdAt: new Date(0).toISOString() };
    const workspace: Workspace = {
      snapshot: vi.fn(async () => snapshot),
      restore: vi.fn(async () => undefined),
    };
    const decisionEngine: RecoveryDecisionEngine = {
      decide: async () => ({ action: "rollback", reason: "restore safe state" }),
    };
    const result = await withRetry(
      fakeAgent([
        { status: "failed", error: new Error("destructive change") },
        { status: "completed", output: "fixed" },
      ]),
      {
        workspace,
        decisionEngine,
        policy: new AllowListPolicy(["rollback"]),
      },
    ).run({ task: "x" });

    expect(result.status).toBe("succeeded");
    expect(workspace.snapshot).toHaveBeenCalledOnce();
    expect(workspace.restore).toHaveBeenCalledWith(snapshot);
  });

  it.each([
    ["cost", { maxCostUsd: 0.5 }, { totalTokens: 1, estimatedCostUsd: 0.5 }],
    ["tokens", { maxTokens: 10 }, { totalTokens: 10, estimatedCostUsd: 0 }],
  ] as const)("stops when the %s budget is exhausted", async (_reason, config, usage) => {
    const decide = vi.fn(async () => ({ action: "retry_same" as const }));
    const result = await withRetry(
      fakeAgent([{ status: "failed", error: new Error("failure"), usage }]),
      { maxAttempts: 5, ...config, decisionEngine: { decide } },
    ).run({ task: "x" });

    expect(result.status).toBe("exhausted");
    expect(result.attempts).toHaveLength(1);
    expect(decide).not.toHaveBeenCalled();
  });

  it("lets task constraints tighten maxAttempts", async () => {
    const result = await withRetry(fakeAgent([{ status: "failed", error: new Error("failure") }]), {
      maxAttempts: 5,
    }).run({ task: { input: "x", constraints: { maxAttempts: 1 } } });

    expect(result.status).toBe("exhausted");
    expect(result.attempts).toHaveLength(1);
  });

  it("honors a pre-aborted signal without invoking the agent", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled by user"));
    const run = vi.fn(async () => ({ status: "completed" as const }));
    const result = await withRetry({ id: "cancelled", run }).run({
      task: "x",
      signal: controller.signal,
    });

    expect(result.status).toBe("aborted");
    expect(result.attempts).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });

  it("enforces a global timeout even when an adapter ignores cancellation", async () => {
    const result = await withRetry(
      { id: "hanging", run: async () => new Promise<never>(() => undefined) },
      { timeoutMs: 10, maxAttempts: 3 },
    ).run({ task: "x" });

    expect(result.status).toBe("exhausted");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.result.status).toBe("timeout");
  });

  it("enforces the global timeout during evaluation", async () => {
    const evaluator = {
      id: "hanging-evaluator",
      evaluate: async () => new Promise<never>(() => undefined),
    };
    const result = await withRetry(fakeAgent([{ status: "completed", output: "candidate" }]), {
      evaluator,
      timeoutMs: 10,
    }).run({ task: "x" });

    expect(result.status).toBe("exhausted");
    expect(result.attempts[0]?.failures?.[0]?.category).toBe("timeout");
  });

  it("enforces the global timeout during decision making", async () => {
    const decisionEngine: RecoveryDecisionEngine = {
      decide: async () => new Promise<never>(() => undefined),
    };
    const result = await withRetry(fakeAgent([{ status: "failed", error: new Error("failure") }]), {
      decisionEngine,
      timeoutMs: 10,
    }).run({ task: "x" });

    expect(result.status).toBe("exhausted");
    expect(result.attempts[0]?.recoveryDecision?.reason).toContain("Decision engine failed");
  });

  it("enforces the global timeout during recovery", async () => {
    const decisionEngine: RecoveryDecisionEngine = {
      decide: async () => ({ action: "wait_and_retry", delayMs: 10_000 }),
    };
    const result = await withRetry(
      fakeAgent([{ status: "failed", error: new Error("rate limit") }]),
      { decisionEngine, timeoutMs: 10 },
    ).run({ task: "x" });

    expect(result.status).toBe("exhausted");
    expect(result.attempts).toHaveLength(1);
  });

  it("aborts an unproductive repeated failure loop", async () => {
    const result = await withRetry(
      fakeAgent([{ status: "failed", error: new Error("same failure") }]),
      { maxAttempts: 5, maxConsecutiveSameFailure: 2, decisionEngine: retrySame },
    ).run({ task: "x" });

    expect(result.status).toBe("aborted");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]?.recoveryDecision?.reason).toBe(
      "Unproductive recovery loop detected",
    );
  });

  it("allows continued retries when the evaluation score improves", async () => {
    let evaluation = 0;
    const evaluator = functionEvaluator(() => {
      evaluation += 1;
      return evaluation === 3
        ? { success: true, score: 1 }
        : {
            success: false,
            score: evaluation * 0.25,
            failures: [{ category: "validation_failure", message: "same failure" }],
          };
    });
    const result = await withRetry(fakeAgent([{ status: "completed", output: "candidate" }]), {
      maxAttempts: 4,
      evaluator,
      decisionEngine: retrySame,
    }).run({ task: "x" });

    expect(result.status).toBe("succeeded");
    expect(result.attempts).toHaveLength(3);
  });

  it("fails closed when the decision engine throws", async () => {
    const decisionEngine: RecoveryDecisionEngine = {
      decide: async () => {
        throw new Error("provider offline");
      },
    };
    const result = await withRetry(fakeAgent([{ status: "failed", error: new Error("failure") }]), {
      decisionEngine,
    }).run({ task: "x" });

    expect(result.status).toBe("aborted");
    expect(result.attempts[0]?.recoveryDecision).toMatchObject({
      action: "abort",
      reason: "Decision engine failed: provider offline",
    });
  });

  it("rejects malformed and unavailable-agent decisions", async () => {
    const malformed = await withRetry(
      fakeAgent([{ status: "failed", error: new Error("failure") }]),
      { decisionEngine: { decide: async () => ({ action: "invented" }) as never } },
    ).run({ task: "x" });
    const unavailable = await withRetry(
      fakeAgent([{ status: "failed", error: new Error("failure") }]),
      {
        decisionEngine: {
          decide: async () => ({ action: "switch_agent", targetAgent: "missing" }),
        },
      },
    ).run({ task: "x" });

    expect(malformed.attempts[0]?.recoveryDecision?.reason).toContain("unknown action");
    expect(unavailable.attempts[0]?.recoveryDecision?.reason).toContain("is not available");
  });
});
