import type {
  AgentAdapter,
  AgentRunInput,
  AgentRunResult,
  SerializedError,
} from "@agent-retry/core";

/** Function accepted by the lightweight built-in adapter. */
export type AgentFunction<TTask, TResult> = (
  input: AgentRunInput<TTask>,
) => Promise<AgentRunResult<TResult> | TResult> | AgentRunResult<TResult> | TResult;

function isRunResult<TResult>(value: unknown): value is AgentRunResult<TResult> {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    ["completed", "failed", "timeout", "cancelled"].includes(String(value.status))
  );
}

function serialize(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { name: "Error", message: String(error) };
}

/** Wraps a function as an AgentAdapter and normalizes thrown errors. */
export function functionAdapter<TTask = unknown, TResult = unknown>(
  run: AgentFunction<TTask, TResult>,
  options: { id?: string } = {},
): AgentAdapter<TTask, TResult> {
  return {
    id: options.id ?? "function-agent",
    async run(input) {
      try {
        const result = await run(input);
        return isRunResult<TResult>(result) ? result : { status: "completed", output: result };
      } catch (error) {
        return { status: "failed", error: serialize(error) };
      }
    },
  };
}
