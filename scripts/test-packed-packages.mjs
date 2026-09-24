import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDirectories = [
  "packages/core",
  "packages/adapter-function",
  "packages/adapter-ai-sdk",
  "packages/decision-rules",
  "packages/decision-jev",
  "packages/evaluator-command",
  "packages/workspace-git",
  "packages/cli",
];
const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-retry-pack-"));
const tarballDirectory = join(temporaryRoot, "tarballs");
const installDirectory = join(temporaryRoot, "consumer");
mkdirSync(tarballDirectory);
mkdirSync(installDirectory);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

try {
  const tarballs = [];

  for (const packageDirectory of packageDirectories) {
    const before = new Set(
      readdirSync(tarballDirectory, { recursive: false, withFileTypes: false }),
    );
    run("pnpm", ["pack", "--pack-destination", tarballDirectory], {
      cwd: join(repositoryRoot, packageDirectory),
    });
    const tarballName = readdirSync(tarballDirectory).find(
      (entry) => entry.endsWith(".tgz") && !before.has(entry),
    );
    assert.ok(tarballName, `No tarball was created for ${packageDirectory}`);

    const tarballPath = join(tarballDirectory, tarballName);
    const contents = run("tar", ["-tzf", tarballPath]).split("\n");
    for (const requiredFile of [
      "package/README.md",
      "package/LICENSE",
      "package/package.json",
      "package/dist/index.js",
      "package/dist/index.d.ts",
    ]) {
      assert.ok(contents.includes(requiredFile), `${tarballName} is missing ${requiredFile}`);
    }

    const packedManifest = JSON.parse(run("tar", ["-xOf", tarballPath, "package/package.json"]));
    assert.doesNotMatch(
      JSON.stringify(packedManifest),
      /workspace:/,
      `${tarballName} contains an unresolved workspace dependency`,
    );
    tarballs.push(tarballPath);
  }

  const dependencies = Object.fromEntries(
    tarballs.map((tarballPath) => {
      const manifest = JSON.parse(run("tar", ["-xOf", tarballPath, "package/package.json"]));
      return [manifest.name, `file:${tarballPath}`];
    }),
  );
  writeFileSync(
    join(installDirectory, "package.json"),
    `${JSON.stringify({ name: "agent-retry-pack-consumer", private: true, type: "module", dependencies }, null, 2)}\n`,
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: installDirectory,
  });

  writeFileSync(
    join(installDirectory, "smoke.mjs"),
    `import { strict as assert } from "node:assert";
import { aiSdkAdapter } from "@agent-retry/adapter-ai-sdk";
import { functionAdapter } from "@agent-retry/adapter-function";
import { createCli } from "@agent-retry/cli";
import { withRetry } from "agent-retry";
import { jevDecisionEngine } from "@agent-retry/decision-jev";
import { failure, rulesDecisionEngine } from "@agent-retry/decision-rules";
import { commandEvaluator } from "@agent-retry/evaluator-command";
import { gitWorkspace } from "@agent-retry/workspace-git";

assert.equal(typeof aiSdkAdapter, "function");
assert.equal(typeof createCli, "function");
assert.equal(typeof jevDecisionEngine, "function");
assert.equal(typeof failure, "function");
assert.equal(typeof rulesDecisionEngine, "function");
assert.equal(typeof commandEvaluator, "function");
assert.equal(typeof gitWorkspace, "function");

let attempts = 0;
const agent = functionAdapter(async () => {
  attempts += 1;
  if (attempts === 1) throw new Error("first attempt fails");
  return "recovered";
});
const result = await withRetry(agent, { maxAttempts: 2 }).run({ task: "smoke" });
assert.equal(result.status, "succeeded");
assert.equal(result.output, "recovered");
assert.equal(result.attempts.length, 2);
`,
  );
  run(process.execPath, ["smoke.mjs"], { cwd: installDirectory });

  const agentScript = join(installDirectory, "agent.mjs");
  writeFileSync(agentScript, 'process.stdout.write(String(process.argv.at(-1)) + "\\n");\n');
  const cliExecutable = join(installDirectory, "node_modules", ".bin", "agent-retry");
  const cliOutput = run(
    cliExecutable,
    ["run", "tarball-smoke", "--agent-command", `node ${agentScript}`, "--json"],
    { cwd: installDirectory },
  );
  const cliResult = JSON.parse(cliOutput);
  assert.equal(cliResult.status, "succeeded");
  assert.equal(cliResult.output, "tarball-smoke");

  process.stdout.write(
    `Verified ${tarballs.length} tarballs in a clean consumer project, including the CLI.\n`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
