#!/usr/bin/env node
import { spawn } from "node:child_process";
import { type AgentAdapter, type RecoveryContext, withRetry } from "@agent-retry/core";
import { commandEvaluator } from "@agent-retry/evaluator-command";
import { Command } from "commander";

interface CliOptions {
  agent: string;
  agentCommand?: string;
  eval?: string;
  maxAttempts: string;
  json?: boolean;
}

function splitCommand(value: string): [string, ...string[]] {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const command = parts.shift();
  if (!command) throw new Error("Command must not be empty");
  return [command, ...parts];
}

function recoveryPrompt(task: string, context?: RecoveryContext): string {
  const additions = context?.additionalContext?.join("\n") ?? "";
  const patch = context?.instructionPatch ?? "";
  return [task, additions && `Previous failure evidence:\n${additions}`, patch]
    .filter(Boolean)
    .join("\n\n");
}

function commandAgent(command: string, args: readonly string[]): AgentAdapter<string, string> {
  return {
    id: command,
    async run({ task, recoveryContext, signal }) {
      return new Promise((resolve) => {
        const child = spawn(command, [...args, recoveryPrompt(task, recoveryContext)], {
          shell: false,
          signal,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        child.once("error", (error) => {
          resolve({ status: "failed", error: { name: error.name, message: error.message } });
        });
        child.once("close", (code) => {
          resolve(
            code === 0
              ? { status: "completed", output: stdout.trim() }
              : {
                  status: "failed",
                  error: {
                    name: "AgentCommandError",
                    message: stderr.trim() || `Agent command exited with code ${code}`,
                  },
                },
          );
        });
      });
    },
  };
}

/** Creates the AgentRetry command-line program. */
export function createCli(): Command {
  const program = new Command().name("agent-retry").description("Bounded recovery for AI agents");
  program
    .command("run")
    .argument("<task>", "task sent to the agent")
    .option("--agent <name>", "built-in agent command (currently codex)", "codex")
    .option("--agent-command <command>", "custom executable and static arguments")
    .option("--eval <command>", "validation executable and arguments")
    .option("--max-attempts <count>", "maximum bounded attempts", "3")
    .option("--json", "print the final result as JSON")
    .action(async (task: string, options: CliOptions) => {
      const maxAttempts = Number.parseInt(options.maxAttempts, 10);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new Error("--max-attempts must be a positive integer");
      }
      const [agentCommandName, ...agentArgs] = options.agentCommand
        ? splitCommand(options.agentCommand)
        : options.agent === "codex"
          ? (["codex", "exec", "--full-auto"] as [string, ...string[]])
          : splitCommand(options.agent);
      const evaluator = options.eval
        ? (() => {
            const [command, ...args] = splitCommand(options.eval);
            return commandEvaluator({ command, args });
          })()
        : undefined;
      const resilient = withRetry(commandAgent(agentCommandName, agentArgs), {
        maxAttempts,
        ...(evaluator ? { evaluator } : {}),
      });
      if (!options.json) {
        resilient.on("attempt:start", ({ attempt, agentId }) => {
          process.stderr.write(`Attempt ${attempt}/${maxAttempts} · ${agentId}\n`);
        });
        resilient.on("decision:complete", ({ decision }) => {
          process.stderr.write(
            `Recovery: ${decision.action} · ${decision.reason ?? "no reason"}\n`,
          );
        });
      }
      const result = await resilient.run({ task });
      process.stdout.write(
        options.json
          ? `${JSON.stringify(result)}\n`
          : `AgentRetry ${result.status} after ${result.attempts.length} attempt(s).\n`,
      );
      if (result.status !== "succeeded") process.exitCode = 1;
    });
  return program;
}

const isEntryPoint =
  process.argv[1]?.endsWith("agent-retry") || process.argv[1]?.endsWith("index.js");
if (isEntryPoint) {
  await createCli().parseAsync(process.argv);
}
