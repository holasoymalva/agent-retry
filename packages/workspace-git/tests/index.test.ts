import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { gitWorkspace } from "../src/index.js";

const exec = promisify(execFile);
const temporaryDirectories: string[] = [];

async function repository(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "agent-retry-git-"));
  temporaryDirectories.push(cwd);
  await exec("git", ["init", "--quiet"], { cwd });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd });
  await exec("git", ["config", "user.name", "AgentRetry Test"], { cwd });
  await writeFile(join(cwd, "file.txt"), "initial\n");
  await exec("git", ["add", "file.txt"], { cwd });
  await exec("git", ["commit", "--quiet", "-m", "initial"], { cwd });
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("gitWorkspace", () => {
  it("requires a clean tree by default", async () => {
    const cwd = await repository();
    const workspace = gitWorkspace({ cwd });
    await workspace.snapshot();
    await writeFile(join(cwd, "file.txt"), "changed\n");
    await expect(workspace.snapshot()).rejects.toThrow("must be clean");
  });

  it("requires explicit restore permission and restores a clean snapshot", async () => {
    const cwd = await repository();
    const snapshot = await gitWorkspace({ cwd }).snapshot();
    await writeFile(join(cwd, "file.txt"), "changed\n");
    await expect(gitWorkspace({ cwd }).restore(snapshot)).rejects.toThrow("disabled");
    await gitWorkspace({ cwd, allowRestore: true }).restore(snapshot);
    await expect(readFile(join(cwd, "file.txt"), "utf8")).resolves.toBe("initial\n");
  });

  it("reports files changed between commit snapshots", async () => {
    const cwd = await repository();
    const workspace = gitWorkspace({ cwd });
    const before = await workspace.snapshot();
    await writeFile(join(cwd, "file.txt"), "changed\n");
    await exec("git", ["add", "file.txt"], { cwd });
    await exec("git", ["commit", "--quiet", "-m", "change"], { cwd });
    const after = await workspace.snapshot();

    await expect(workspace.diff?.(before, after)).resolves.toEqual({
      summary: "1 file(s) changed",
      files: ["file.txt"],
    });
  });
});
