# `@agent-retry/workspace-git`

Safe Git-backed snapshots, diffs, and explicitly enabled rollback support for Agent Retry.

## Install

```bash
pnpm add agent-retry @agent-retry/workspace-git
```

## Usage

```ts
import { gitWorkspace } from "@agent-retry/workspace-git";

const workspace = gitWorkspace({
  cwd: "/absolute/path/to/repository",
  requireCleanWorkingTree: true,
  allowRestore: false,
});
```

Clean-tree enforcement defaults to true and destructive restore stays disabled until
`allowRestore: true` is explicitly configured.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
