import { describe, expect, it } from "vitest";
import { functionAdapter } from "../src/index.js";

describe("functionAdapter", () => {
  it("normalizes plain output", async () => {
    const adapter = functionAdapter(async ({ task }: { task: string }) => task.toUpperCase());
    await expect(adapter.run({ task: "hello", attempt: 1, previousAttempts: [] })).resolves.toEqual(
      {
        status: "completed",
        output: "HELLO",
      },
    );
  });

  it("normalizes thrown errors", async () => {
    const adapter = functionAdapter(() => {
      throw new Error("boom");
    });
    const result = await adapter.run({ task: null, attempt: 1, previousAttempts: [] });
    expect(result).toMatchObject({ status: "failed", error: { message: "boom" } });
  });
});
