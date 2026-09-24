import { describe, expect, it } from "vitest";
import { OperationTimeoutError, withTimeout } from "../src/index.js";

describe("withTimeout", () => {
  it("returns an operation completed within the limit", async () => {
    await expect(withTimeout(async () => "ok", 100)).resolves.toBe("ok");
  });

  it("aborts and rejects an operation that exceeds the limit", async () => {
    await expect(
      withTimeout(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
        5,
      ),
    ).rejects.toBeInstanceOf(OperationTimeoutError);
  });

  it("propagates parent cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("manual abort"));
    await expect(withTimeout(async () => "never", 100, controller.signal)).rejects.toThrow(
      "manual abort",
    );
  });

  it("rejects invalid timeout values", async () => {
    await expect(withTimeout(async () => "never", 0)).rejects.toThrow("positive finite");
  });
});
