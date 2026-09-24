import { describe, expect, it } from "vitest";
import {
  DefaultFailureClassifier,
  DefaultRecoveryDecisionEngine,
  type FailureCategory,
  type RecoveryAction,
} from "../src/index.js";

describe("DefaultFailureClassifier", () => {
  it.each([
    ["HTTP 429 too many requests", "rate_limit"],
    ["403 permission denied", "permission_error"],
    ["ECONNRESET network failure", "network_error"],
    ["ENOMEM out of memory", "environment_error"],
    ["Cannot find module dependency", "dependency_error"],
    ["missing context for task", "missing_context"],
    ["unrecognized failure", "agent_error"],
  ] as const)("classifies %s as %s", async (message, category) => {
    const result = await new DefaultFailureClassifier().classify({
      result: { status: "failed", error: { name: "Error", message } },
      attempt: 1,
    });
    expect(result.failures[0]?.category).toBe(category);
  });

  it("classifies timeouts and gives evaluator evidence precedence", async () => {
    const classifier = new DefaultFailureClassifier();
    const timeout = await classifier.classify({ result: { status: "timeout" }, attempt: 1 });
    const evaluated = await classifier.classify({
      result: { status: "failed", error: { name: "Error", message: "network" } },
      evaluation: {
        success: false,
        failures: [{ category: "test_failure", message: "two tests failed" }],
      },
      attempt: 1,
    });
    expect(timeout.failures[0]?.category).toBe("timeout");
    expect(evaluated.failures[0]?.category).toBe("test_failure");
  });
});

describe("DefaultRecoveryDecisionEngine", () => {
  it.each([
    ["network_error", "wait_and_retry"],
    ["rate_limit", "wait_and_retry"],
    ["timeout", "retry_same"],
    ["missing_context", "retry_with_context"],
    ["test_failure", "retry_with_context"],
    ["permission_error", "abort"],
    ["policy_violation", "abort"],
    ["destructive_change", "rollback"],
    ["unknown", "abort"],
  ] as readonly [FailureCategory, RecoveryAction][])("maps %s to %s", async (category, action) => {
    const decision = await new DefaultRecoveryDecisionEngine().decide({
      failures: [{ category, message: "evidence" }],
    } as never);
    expect(decision.action).toBe(action);
    expect(decision.evidence).toEqual(["evidence"]);
  });
});
