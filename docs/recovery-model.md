# Recovery model

The default engine is deliberately conservative. Network and rate-limit failures wait and retry;
timeouts and generic agent errors retry unchanged; validation, test, build, lint, missing-context,
and invalid-output failures add evidence to the next attempt. Permission and policy failures abort.

Every decision includes a user-facing reason. The policy gate runs after the decision engine and
before its strategy. An action rejected by policy becomes an explained abort. Repeated identical
failure/action pairs trigger loop protection.
