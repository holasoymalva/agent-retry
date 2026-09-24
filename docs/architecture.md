# Architecture

The core runtime follows one explicit path:

```text
execute → evaluate → classify → decide → policy check → recover → repeat
```

Every run owns a validated state machine and a monotonic retry budget. Attempts are recorded as
new immutable objects; a previous record is never modified in place. Provider integrations,
evaluators, decision engines, recovery strategies, policies, and workspaces are interfaces, so a
new implementation does not require edits to the runtime.

The core has no provider SDK dependency. Optional packages depend inward on core.
