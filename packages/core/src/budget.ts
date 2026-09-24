import { BudgetExceededError } from "./errors.js";
import type { AgentUsage, BudgetSnapshot, RetryBudgetConfig } from "./types.js";

/** Monotonic accounting for attempts, time, tokens, and cost. */
export class RetryBudget {
  readonly #config: RetryBudgetConfig;
  readonly #startedAt: number;
  #attemptsUsed = 0;
  #tokensUsed = 0;
  #costUsedUsd = 0;

  constructor(config: RetryBudgetConfig, startedAt = Date.now()) {
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
      throw new RangeError("maxAttempts must be a positive integer");
    }
    this.#config = config;
    this.#startedAt = startedAt;
  }

  consumeAttempt(): void {
    if (!this.canAttempt()) {
      throw new BudgetExceededError("Retry budget is exhausted");
    }
    this.#attemptsUsed += 1;
  }

  addUsage(usage?: AgentUsage): void {
    this.#tokensUsed += usage?.totalTokens ?? 0;
    this.#costUsedUsd += usage?.estimatedCostUsd ?? 0;
  }

  canAttempt(now = Date.now()): boolean {
    return !this.snapshot(now).exhausted;
  }

  snapshot(now = Date.now()): BudgetSnapshot {
    const elapsedMs = Math.max(0, now - this.#startedAt);
    let reason: BudgetSnapshot["reason"];
    if (this.#attemptsUsed >= this.#config.maxAttempts) reason = "attempts";
    else if (this.#config.timeoutMs !== undefined && elapsedMs >= this.#config.timeoutMs)
      reason = "timeout";
    else if (this.#config.maxCostUsd !== undefined && this.#costUsedUsd >= this.#config.maxCostUsd)
      reason = "cost";
    else if (this.#config.maxTokens !== undefined && this.#tokensUsed >= this.#config.maxTokens)
      reason = "tokens";

    return {
      maxAttempts: this.#config.maxAttempts,
      attemptsUsed: this.#attemptsUsed,
      attemptsRemaining: Math.max(0, this.#config.maxAttempts - this.#attemptsUsed),
      ...(this.#config.timeoutMs !== undefined ? { timeoutMs: this.#config.timeoutMs } : {}),
      elapsedMs,
      ...(this.#config.maxCostUsd !== undefined ? { maxCostUsd: this.#config.maxCostUsd } : {}),
      costUsedUsd: this.#costUsedUsd,
      ...(this.#config.maxTokens !== undefined ? { maxTokens: this.#config.maxTokens } : {}),
      tokensUsed: this.#tokensUsed,
      exhausted: reason !== undefined,
      ...(reason !== undefined ? { reason } : {}),
    };
  }
}
