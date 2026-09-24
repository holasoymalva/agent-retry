import { type AgentRetryConfig, AgentRetryRuntime } from "./runtime.js";
import type { AgentAdapter, AgentRetryResult, AgentTask } from "./types.js";

/** Creates the full runtime API. */
export function createAgentRetry<TResult = unknown>(config: AgentRetryConfig<TResult> = {}) {
  return new AgentRetryRuntime<TResult>(config);
}

/** Input accepted by the convenience wrapper. */
export interface ResilientAgentInput<TTask> {
  readonly task: TTask | AgentTask<TTask>;
  readonly signal?: AbortSignal;
}

function isAgentTask<TTask>(value: TTask | AgentTask<TTask>): value is AgentTask<TTask> {
  return typeof value === "object" && value !== null && "input" in value;
}

/** Wraps an existing adapter with bounded recovery behavior. */
export function withRetry<TTask = unknown, TResult = unknown>(
  agent: AgentAdapter<TTask, TResult>,
  config: AgentRetryConfig<TResult> = {},
): {
  run(input: ResilientAgentInput<TTask>): Promise<AgentRetryResult<TResult>>;
  on: AgentRetryRuntime<TResult>["on"];
} {
  const runtime = new AgentRetryRuntime<TResult>(config);
  return {
    run: ({ task, signal }) =>
      runtime.run({
        task: isAgentTask(task) ? task : { input: task },
        agent,
        ...(signal !== undefined ? { signal } : {}),
      }),
    on: runtime.on.bind(runtime),
  };
}

/** Identity helper for typed configuration files. */
export function defineConfig<TResult = unknown>(
  config: AgentRetryConfig<TResult>,
): AgentRetryConfig<TResult> {
  return config;
}
