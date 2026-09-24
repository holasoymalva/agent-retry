import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Workspace, WorkspaceDiff, WorkspaceSnapshot } from "@agent-retry/core";

const execFileAsync = promisify(execFile);

/** Safe Git workspace options. Clean-tree enforcement is enabled by default. */
export interface GitWorkspaceOptions {
  readonly cwd: string;
  readonly requireCleanWorkingTree?: boolean;
  readonly allowRestore?: boolean;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

/** Creates snapshots backed by Git commit references with an explicit restore gate. */
export function gitWorkspace(options: GitWorkspaceOptions): Workspace {
  const requireClean = options.requireCleanWorkingTree ?? true;
  return {
    async snapshot(): Promise<WorkspaceSnapshot> {
      const root = await git(options.cwd, ["rev-parse", "--show-toplevel"]);
      const status = await git(options.cwd, ["status", "--porcelain=v1"]);
      if (requireClean && status) {
        throw new Error("Git workspace must be clean before creating a snapshot");
      }
      const ref = await git(options.cwd, ["rev-parse", "HEAD"]);
      return {
        id: ref,
        createdAt: new Date().toISOString(),
        metadata: { root, clean: !status },
      };
    },
    async restore(snapshot): Promise<void> {
      if (!options.allowRestore) {
        throw new Error("Git restore is disabled; set allowRestore: true explicitly");
      }
      if (snapshot.metadata?.clean !== true) {
        throw new Error("Refusing to restore a snapshot that was not recorded as clean");
      }
      await git(options.cwd, ["restore", "--source", snapshot.id, "--staged", "--worktree", "."]);
    },
    async diff(from, to): Promise<WorkspaceDiff> {
      const files = (await git(options.cwd, ["diff", "--name-only", from.id, to.id]))
        .split("\n")
        .filter(Boolean);
      return { summary: `${files.length} file(s) changed`, files };
    },
  };
}
