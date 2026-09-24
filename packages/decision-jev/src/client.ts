import { z } from "zod";

const responseSchema = z.object({
  action: z.enum([
    "retry_same",
    "retry_with_context",
    "retry_with_modified_instructions",
    "retry_with_stronger_model",
    "switch_agent",
    "wait_and_retry",
    "reset_workspace",
    "rollback",
    "ask_human",
    "abort",
  ]),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  targetAgent: z.string().optional(),
  targetModel: z.string().optional(),
  delayMs: z.number().nonnegative().optional(),
  additionalContext: z.array(z.string()).optional(),
  instructionPatch: z.string().optional(),
});

/** Validated transport request sent to a Jev-compatible endpoint. */
export interface JevRequest {
  readonly context: string;
  readonly choices: readonly string[];
}

/** Isolated Jev HTTP transport configuration. */
export interface JevClientOptions {
  readonly apiKey: string;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

/** Creates a small, validated Jev-compatible HTTP client. */
export function createJevClient(options: JevClientOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return {
    async decide(request: JevRequest) {
      const response = await fetchImplementation(
        options.endpoint ?? "https://api.typesafety.dev/v1/decisions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        },
      );
      if (!response.ok) throw new Error(`Jev request failed with status ${response.status}`);
      return responseSchema.parse(await response.json());
    },
  };
}
