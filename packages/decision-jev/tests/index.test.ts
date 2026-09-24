import { describe, expect, it, vi } from "vitest";
import { jevDecisionEngine } from "../src/index.js";

describe("jevDecisionEngine", () => {
  it("validates a constrained response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ action: "retry_with_context", confidence: 0.9 }), {
        status: 200,
      }),
    );
    const decision = await jevDecisionEngine({ apiKey: "secret", fetch }).decide({
      attempt: { index: 1 },
      failures: [{ category: "unknown", message: "x" }],
      history: [],
      budget: {},
      availableAgents: [],
    } as never);
    expect(decision).toMatchObject({ action: "retry_with_context", confidence: 0.9 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fails closed on transport errors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));
    const decision = await jevDecisionEngine({ apiKey: "secret", fetch }).decide({
      attempt: { index: 1 },
      failures: [],
      history: [],
      budget: {},
      availableAgents: [],
    } as never);
    expect(decision).toMatchObject({ action: "abort" });
  });

  it("uses the configured fallback for invalid provider responses", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ action: "not-valid" }), {
        status: 200,
      }),
    );
    const fallback = { decide: vi.fn(async () => ({ action: "retry_same" as const })) };
    const decision = await jevDecisionEngine({ apiKey: "secret", fetch, fallback }).decide({
      attempt: { index: 1 },
      failures: [{ category: "unknown", message: "x" }],
      history: [],
      budget: {},
      availableAgents: [],
    } as never);
    expect(decision.action).toBe("retry_same");
    expect(fallback.decide).toHaveBeenCalledOnce();
  });

  it("does not send task input to the decision provider", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ action: "abort" }), {
        status: 200,
      }),
    );
    await jevDecisionEngine({ apiKey: "secret", fetch }).decide({
      task: { input: "private task contents" },
      attempt: { index: 1 },
      failures: [{ category: "unknown", message: "safe evidence" }],
      history: [],
      budget: {},
      availableAgents: [],
    } as never);
    const request = fetch.mock.calls[0]?.[1];
    expect(String(request?.body)).not.toContain("private task contents");
    expect(String(request?.body)).toContain("safe evidence");
  });
});
