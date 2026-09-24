import type { AgentAdapter, AgentRunResult } from "./types.js";

/** Creates a deterministic adapter that returns scripted results in order. */
export function fakeAgent<TTask = unknown, TResult = unknown>(
  results: readonly (AgentRunResult<TResult> | { status: "failed"; error: Error })[],
  id = "fake-agent",
): AgentAdapter<TTask, TResult> {
  let cursor = 0;
  return {
    id,
    async run() {
      const result = results[Math.min(cursor, results.length - 1)];
      cursor += 1;
      if (!result) throw new Error("fakeAgent requires at least one scripted result");
      if (result.error instanceof Error) {
        const { error, ...rest } = result;
        return {
          ...rest,
          error: {
            name: error.name,
            message: error.message,
            ...(error.stack !== undefined ? { stack: error.stack } : {}),
          },
        };
      }
      return result;
    },
  };
}
