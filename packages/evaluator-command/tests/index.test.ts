import { describe, expect, it } from "vitest";
import { commandEvaluator } from "../src/index.js";

const context = {
  task: { input: "x" },
  result: { status: "completed" as const },
  attempt: 1,
};

describe("commandEvaluator", () => {
  it("accepts a successful command", async () => {
    const result = await commandEvaluator({
      command: process.execPath,
      args: ["-e", "console.log('ok')"],
    }).evaluate(context);
    expect(result).toMatchObject({ success: true, score: 1 });
  });

  it("captures a failed command", async () => {
    const result = await commandEvaluator({
      command: process.execPath,
      args: ["-e", "console.error('failed test'); process.exit(1)", "test"],
    }).evaluate(context);
    expect(result.success).toBe(false);
    expect(result.failures?.[0]).toMatchObject({ category: "test_failure" });
    expect(result.failures?.[0]?.evidence).toContain("failed test");
  });

  it("times out", async () => {
    const result = await commandEvaluator({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 10,
    }).evaluate(context);
    expect(result.failures?.[0]?.category).toBe("timeout");
  });

  it("reports missing executables as environment errors", async () => {
    const result = await commandEvaluator({
      command: `agent-retry-command-that-does-not-exist-${Date.now()}`,
    }).evaluate(context);
    expect(result.failures?.[0]?.category).toBe("environment_error");
  });

  it("bounds captured command output", async () => {
    const result = await commandEvaluator({
      command: process.execPath,
      args: ["-e", "console.error('abcdefghijklmnopqrstuvwxyz'); process.exit(1)"],
      maxOutputBytes: 8,
    }).evaluate(context);
    const evidence = result.failures?.[0]?.evidence ?? "";
    expect(evidence.length).toBeLessThanOrEqual(8);
    expect(evidence).toBe("tuvwxyz");
  });
});
