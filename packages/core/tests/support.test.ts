import { describe, expect, it, vi } from "vitest";
import {
  AgentRegistry,
  AgentRetryEvents,
  AllowListPolicy,
  createBuiltInStrategies,
  type RecoveryAction,
} from "../src/index.js";

describe("support components", () => {
  it("registers, lists, and rejects duplicate agents", () => {
    const first = { id: "first", run: vi.fn() };
    const registry = new AgentRegistry([first]);
    expect(registry.get("first")).toBe(first);
    expect(registry.list()).toEqual([{ id: "first" }]);
    expect(() => registry.register(first)).toThrow("already registered");
  });

  it("unsubscribes event listeners", () => {
    const events = new AgentRetryEvents();
    const listener = vi.fn();
    const unsubscribe = events.on("run:start", listener);
    events.emit("run:start", { runId: "1", startedAt: "now" });
    unsubscribe();
    events.emit("run:start", { runId: "2", startedAt: "later" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("enforces both organization and task action allow-lists", async () => {
    const policy = new AllowListPolicy(["retry_same", "retry_with_context"]);
    const input = {
      task: { input: "x", constraints: { allowedRecoveryActions: ["retry_same"] } },
    } as never;
    await expect(policy.canExecuteRecovery({ action: "retry_same" }, input)).resolves.toEqual({
      allowed: true,
    });
    await expect(
      policy.canExecuteRecovery({ action: "retry_with_context" }, input),
    ).resolves.toMatchObject({ allowed: false });
    await expect(policy.canExecuteRecovery({ action: "rollback" }, input)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("provides one built-in strategy for every recovery action", () => {
    const actions = createBuiltInStrategies().map((strategy) => strategy.action);
    const expected: RecoveryAction[] = [
      "retry_same",
      "retry_with_context",
      "retry_with_modified_instructions",
      "retry_with_stronger_model",
      "switch_agent",
      "wait_and_retry",
      "reset_workspace",
      "rollback",
      "ask_human",
      "abort",
    ];
    expect(actions).toEqual(expected);
  });
});
