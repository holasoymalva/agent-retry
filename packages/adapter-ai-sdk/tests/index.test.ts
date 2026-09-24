import { describe, expect, it } from "vitest";
import { aiSdkAdapter } from "../src/index.js";

const input = { task: "hello", attempt: 1, previousAttempts: [] };

describe("aiSdkAdapter", () => {
  it("normalizes text and usage", async () => {
    const adapter = aiSdkAdapter({
      generate: async () => ({ text: "done", usage: { inputTokens: 2, outputTokens: 1 } }),
    });
    await expect(adapter.run(input)).resolves.toMatchObject({
      status: "completed",
      output: "done",
      usage: { inputTokens: 2, outputTokens: 1 },
    });
  });

  it("normalizes provider errors", async () => {
    const adapter = aiSdkAdapter({
      generate: async () => {
        throw new Error("provider unavailable");
      },
    });
    await expect(adapter.run(input)).resolves.toMatchObject({
      status: "failed",
      error: { message: "provider unavailable" },
    });
  });

  it("prefers structured output and records the model", async () => {
    const adapter = aiSdkAdapter({
      generate: async () => ({
        text: "fallback",
        output: { answer: 42 },
        response: { modelId: "model-1" },
      }),
    });
    await expect(adapter.run(input)).resolves.toMatchObject({
      status: "completed",
      output: { answer: 42 },
      metadata: { model: "model-1" },
    });
  });
});
