import { OperationTimeoutError } from "./errors.js";

/** Runs an operation under a dedicated timeout and optional parent cancellation signal. */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  if (parentSignal?.aborted) onParentAbort();
  const timer = setTimeout(
    () => controller.abort(new OperationTimeoutError(`Operation timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        if (controller.signal.aborted) {
          reject(controller.signal.reason ?? new OperationTimeoutError("Operation timed out"));
          return;
        }
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(controller.signal.reason ?? new OperationTimeoutError("Operation timed out")),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
