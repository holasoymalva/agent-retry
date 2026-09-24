import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  compositeEvaluator,
  type Evaluator,
  functionEvaluator,
  schemaEvaluator,
} from "../src/index.js";

const context = {
  task: { input: "x" },
  result: { status: "completed" as const, output: { name: "agent" } },
  attempt: 1,
};

const evaluator = (success: boolean, score: number): Evaluator => ({
  id: `evaluator-${score}`,
  evaluate: async () => ({
    success,
    score,
    failures: success ? [] : [{ category: "validation_failure", message: `score ${score}` }],
  }),
});

describe("evaluators", () => {
  it("wraps synchronous function evaluators", async () => {
    const result = await functionEvaluator(() => ({ success: true }), "custom").evaluate(context);
    expect(result.success).toBe(true);
  });

  it("supports all, any, and weighted composite strategies", async () => {
    const members = [evaluator(true, 1), evaluator(false, 0.4)];
    const all = await compositeEvaluator(members).evaluate(context);
    const any = await compositeEvaluator(members, { strategy: "any" }).evaluate(context);
    const weighted = await compositeEvaluator(members, {
      strategy: "weighted",
      threshold: 0.7,
    }).evaluate(context);

    expect(all).toMatchObject({ success: false, score: 0.7 });
    expect(any.success).toBe(true);
    expect(weighted.success).toBe(true);
    expect(all.failures).toHaveLength(1);
  });

  it("validates structured output with a schema", async () => {
    const schema = schemaEvaluator(z.object({ name: z.string() }));
    await expect(schema.evaluate(context)).resolves.toMatchObject({ success: true, score: 1 });
    await expect(
      schema.evaluate({ ...context, result: { status: "completed", output: { name: 42 } } }),
    ).resolves.toMatchObject({
      success: false,
      failures: [{ category: "invalid_output", source: "schema" }],
    });
  });
});
