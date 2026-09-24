import { AgentRetryError } from "./errors.js";
import type { RunState } from "./types.js";

const transitions: Readonly<Record<RunState, readonly RunState[]>> = {
  idle: ["running", "aborted"],
  running: ["evaluating", "failed", "aborted", "exhausted"],
  evaluating: ["succeeded", "failed", "aborted", "exhausted"],
  failed: ["deciding", "aborted", "exhausted"],
  deciding: ["recovering", "waiting_for_human", "aborted", "exhausted"],
  recovering: ["running", "aborted", "exhausted"],
  waiting_for_human: ["running", "aborted"],
  succeeded: [],
  aborted: [],
  exhausted: [],
};

/** Error thrown when the runtime attempts an invalid state transition. */
export class InvalidStateTransitionError extends AgentRetryError {
  constructor(from: RunState, to: RunState) {
    super(`Invalid AgentRetry state transition: ${from} -> ${to}`);
  }
}

/** Small validated state machine used by every recovery run. */
export class RunStateMachine {
  #state: RunState = "idle";

  get state(): RunState {
    return this.#state;
  }

  transition(next: RunState): void {
    if (!transitions[this.#state].includes(next)) {
      throw new InvalidStateTransitionError(this.#state, next);
    }
    this.#state = next;
  }

  isTerminal(): boolean {
    return transitions[this.#state].length === 0;
  }
}
