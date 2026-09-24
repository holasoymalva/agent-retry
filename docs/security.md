# Security

- Runs have a finite attempt limit (three by default), with optional time, token, and cost limits.
- Destructive workspace actions are denied by the default policy.
- The command evaluator uses `spawn` with `shell: false`; command and arguments remain separate.
- Git snapshots require a clean tree by default. Restore is disabled unless explicitly enabled and
  refuses snapshots not recorded as clean.
- Core telemetry records structured metadata, not environment variables, prompts, API keys, or
  repository contents.
- The Jev adapter sends a compact failure summary and never includes task input or environment data.
