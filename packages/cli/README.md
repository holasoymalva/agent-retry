# `@agent-retry/cli`

Command-line interface for bounded AI agent recovery.

## Install

```bash
npm install --global @agent-retry/cli
```

## Usage

```bash
agent-retry run "Fix the failing tests" \
  --agent codex \
  --eval "pnpm test" \
  --max-attempts 3
```

Use `--agent-command` for a custom executable and `--json` for a machine-readable final result.
Commands are spawned without a shell.

[Documentation](https://github.com/holasoymalva/agent-retry#readme) ·
[Issues](https://github.com/holasoymalva/agent-retry/issues)

Apache-2.0
