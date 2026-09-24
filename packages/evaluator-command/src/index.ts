import { spawn } from "node:child_process";
import type { Evaluator, FailureCategory } from "agent-retry";

/** Configuration for a shell-free validation command. */
export interface CommandEvaluatorOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

function classify(command: string, args: readonly string[]): FailureCategory {
  const text = `${command} ${args.join(" ")}`.toLowerCase();
  if (/\btest\b|vitest|jest|mocha/.test(text)) return "test_failure";
  if (/\blint\b|biome|eslint/.test(text)) return "lint_failure";
  if (/\bbuild\b|tsc/.test(text)) return "build_failure";
  return "validation_failure";
}

/** Runs a command without a shell and turns its exit status into evaluation evidence. */
export function commandEvaluator(options: CommandEvaluatorOptions): Evaluator {
  if (!options.command.trim()) throw new Error("command must not be empty");
  const args = [...(options.args ?? [])];
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024;

  return {
    id: `command:${options.command}`,
    async evaluate({ signal }) {
      return new Promise((resolve) => {
        const controller = new AbortController();
        const onAbort = () => controller.abort(signal?.reason);
        signal?.addEventListener("abort", onAbort, { once: true });
        const timer =
          options.timeoutMs === undefined
            ? undefined
            : setTimeout(
                () => controller.abort(new Error("Command evaluation timed out")),
                options.timeoutMs,
              );
        let stdout = "";
        let stderr = "";
        let settled = false;
        const child = spawn(options.command, args, {
          ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
          env: { ...process.env, ...(options.env ?? {}) },
          shell: false,
          signal: controller.signal,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const append = (current: string, chunk: Buffer): string =>
          (current + chunk.toString("utf8")).slice(-maxOutputBytes);
        child.stdout.on("data", (chunk: Buffer) => {
          stdout = append(stdout, chunk);
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr = append(stderr, chunk);
        });
        const cleanup = () => {
          if (timer !== undefined) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({
            success: false,
            score: 0,
            failures: [
              {
                category: controller.signal.aborted ? "timeout" : "environment_error",
                message: error.message,
                evidence: stderr || stdout,
                source: options.command,
                retryable: true,
              },
            ],
          });
        });
        child.once("close", (code, signalName) => {
          if (settled) return;
          settled = true;
          cleanup();
          const success = code === 0;
          resolve({
            success,
            score: success ? 1 : 0,
            ...(success
              ? {
                  observations: [
                    {
                      type: "command_output",
                      message: stdout.trim() || `${options.command} completed successfully`,
                    },
                  ],
                }
              : {
                  failures: [
                    {
                      category: controller.signal.aborted
                        ? "timeout"
                        : classify(options.command, args),
                      message: controller.signal.aborted
                        ? `Command timed out after ${options.timeoutMs}ms`
                        : `Command exited with code ${code ?? "unknown"}${signalName ? ` (${signalName})` : ""}`,
                      evidence: [stdout, stderr].filter(Boolean).join("\n").trim(),
                      source: options.command,
                      retryable: true,
                      metadata: { exitCode: code, signal: signalName },
                    },
                  ],
                }),
            metadata: { command: options.command, args, exitCode: code },
          });
        });
      });
    },
  };
}
