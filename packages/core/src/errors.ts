/** Base class for errors raised by the AgentRetry framework itself. */
export class AgentRetryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Raised when an operation cannot start because its retry budget is exhausted. */
export class BudgetExceededError extends AgentRetryError {}

/** Raised when a recovery action is rejected by policy. */
export class PolicyDeniedError extends AgentRetryError {}

/** Raised when an adapter violates its runtime contract. */
export class AdapterError extends AgentRetryError {}

/** Raised when an evaluator cannot produce an evaluation result. */
export class EvaluationError extends AgentRetryError {}

/** Raised when an asynchronous operation exceeds its configured timeout. */
export class OperationTimeoutError extends AgentRetryError {}
