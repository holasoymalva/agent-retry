# Contributing

Thank you for helping make AI agent recovery safer and more predictable.

## Development

Use Node.js 22+ and pnpm:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Run `pnpm test:pack` whenever package metadata, exports, dependencies, or build output changes. It
packs every public package, installs the tarballs into a clean consumer project, imports all package
entry points, executes a recovery example, and invokes the CLI.

## Pull requests

- Keep provider dependencies outside `agent-retry`.
- Add deterministic tests for recovery paths.
- Preserve bounded execution and fail-closed safety behavior.
- Avoid logging credentials, prompts, or unbounded command output.
- Add a Changeset for any user-visible package change with `pnpm changeset`.
- Update documentation when public behavior changes.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues,
follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
