import type {
  AgentRetryResult,
  AttemptRecord,
  EvaluationResult,
  FailureSignal,
  RecoveryDecision,
} from "./types.js";

/** Strongly typed runtime lifecycle event map. */
export interface AgentRetryEventMap<TResult = unknown> {
  "run:start": { runId: string; startedAt: string };
  "attempt:start": { runId: string; attempt: number; agentId: string };
  "attempt:complete": { runId: string; attempt: AttemptRecord<TResult> };
  "evaluation:start": { runId: string; attempt: number };
  "evaluation:complete": { runId: string; attempt: number; evaluation: EvaluationResult };
  "failure:classified": { runId: string; attempt: number; failures: readonly FailureSignal[] };
  "decision:start": { runId: string; attempt: number };
  "decision:complete": { runId: string; attempt: number; decision: RecoveryDecision };
  "recovery:start": { runId: string; attempt: number; decision: RecoveryDecision };
  "recovery:complete": { runId: string; attempt: number; decision: RecoveryDecision };
  "run:success": { result: AgentRetryResult<TResult> };
  "run:abort": { result: AgentRetryResult<TResult> };
  "run:exhausted": { result: AgentRetryResult<TResult> };
}

/** Tiny typed event emitter with no runtime dependency. */
export class AgentRetryEvents<TResult = unknown> {
  readonly #listeners = new Map<keyof AgentRetryEventMap<TResult>, Set<(payload: never) => void>>();

  on<K extends keyof AgentRetryEventMap<TResult>>(
    event: K,
    listener: (payload: AgentRetryEventMap<TResult>[K]) => void,
  ): () => void {
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener as (payload: never) => void);
    this.#listeners.set(event, listeners);
    return () => listeners.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof AgentRetryEventMap<TResult>>(
    event: K,
    payload: AgentRetryEventMap<TResult>[K],
  ): void {
    for (const listener of this.#listeners.get(event) ?? []) listener(payload as never);
  }
}
