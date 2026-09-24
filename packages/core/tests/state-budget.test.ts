import { describe, expect, it } from "vitest";
import { InvalidStateTransitionError, RetryBudget, RunStateMachine } from "../src/index.js";

describe("RunStateMachine", () => {
  it("validates transitions and protects terminal states", () => {
    const machine = new RunStateMachine();
    machine.transition("running");
    machine.transition("evaluating");
    machine.transition("succeeded");
    expect(machine.isTerminal()).toBe(true);
    expect(() => machine.transition("running")).toThrow(InvalidStateTransitionError);
  });

  it("rejects invalid transitions", () => {
    expect(() => new RunStateMachine().transition("succeeded")).toThrow("idle -> succeeded");
  });
});

describe("RetryBudget", () => {
  it("accounts for attempts, cost, and tokens", () => {
    const budget = new RetryBudget({ maxAttempts: 3, maxCostUsd: 1, maxTokens: 100 }, 0);
    budget.consumeAttempt();
    budget.addUsage({ totalTokens: 40, estimatedCostUsd: 0.25 });
    expect(budget.snapshot(10)).toMatchObject({
      attemptsUsed: 1,
      attemptsRemaining: 2,
      tokensUsed: 40,
      costUsedUsd: 0.25,
      exhausted: false,
    });
  });

  it("reports the first exhausted bound", () => {
    const budget = new RetryBudget({ maxAttempts: 1 });
    budget.consumeAttempt();
    expect(budget.snapshot()).toMatchObject({ exhausted: true, reason: "attempts" });
    expect(() => budget.consumeAttempt()).toThrow("exhausted");
  });

  it("reports timeout, cost, and token exhaustion", () => {
    expect(new RetryBudget({ maxAttempts: 3, timeoutMs: 10 }, 0).snapshot(10)).toMatchObject({
      exhausted: true,
      reason: "timeout",
    });

    const cost = new RetryBudget({ maxAttempts: 3, maxCostUsd: 0.5 });
    cost.addUsage({ estimatedCostUsd: 0.5 });
    expect(cost.snapshot()).toMatchObject({ exhausted: true, reason: "cost" });

    const tokens = new RetryBudget({ maxAttempts: 3, maxTokens: 10 });
    tokens.addUsage({ totalTokens: 10 });
    expect(tokens.snapshot()).toMatchObject({ exhausted: true, reason: "tokens" });
  });

  it("rejects invalid attempt limits", () => {
    expect(() => new RetryBudget({ maxAttempts: 0 })).toThrow("positive integer");
    expect(() => new RetryBudget({ maxAttempts: 1.5 })).toThrow("positive integer");
  });
});
