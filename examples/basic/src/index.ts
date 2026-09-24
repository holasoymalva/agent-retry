import { functionAdapter } from "@agent-retry/adapter-function";
import { withRetry } from "@agent-retry/core";

const agent = functionAdapter(async ({ attempt }) => {
  if (attempt === 1) throw new Error("temporary network failure");
  return "done";
});

const result = await withRetry(agent, { maxAttempts: 3 }).run({ task: "example" });
console.log(result.status, result.output, result.attempts.length);
