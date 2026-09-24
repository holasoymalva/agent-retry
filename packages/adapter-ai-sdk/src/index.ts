import type { AgentAdapter, AgentRunInput, AgentUsage } from "@agent-retry/core";

/** Minimal AI SDK-compatible generation result, avoiding a core provider dependency. */
export interface AiSdkResult<TResult = unknown> {
  readonly text?: string;
  readonly output?: TResult;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly response?: { readonly modelId?: string };
}

/** Injected generation function compatible with AI SDK wrappers. */
export type AiSdkGenerate<TTask, TResult> = (
  input: AgentRunInput<TTask>,
) => Promise<AiSdkResult<TResult>>;

/** Adapts an injected AI SDK generation function without coupling core to the AI SDK. */
export function aiSdkAdapter<TTask = string, TResult = string>(options: {
  readonly generate: AiSdkGenerate<TTask, TResult>;
  readonly id?: string;
}): AgentAdapter<TTask, TResult> {
  return {
    id: options.id ?? "ai-sdk-agent",
    async run(input) {
      try {
        const result = await options.generate(input);
        const usage: AgentUsage | undefined = result.usage
          ? {
              ...(result.usage.inputTokens !== undefined
                ? { inputTokens: result.usage.inputTokens }
                : {}),
              ...(result.usage.outputTokens !== undefined
                ? { outputTokens: result.usage.outputTokens }
                : {}),
              ...(result.usage.totalTokens !== undefined
                ? { totalTokens: result.usage.totalTokens }
                : {}),
            }
          : undefined;
        const output = result.output ?? (result.text as TResult | undefined);
        return {
          status: "completed",
          ...(output !== undefined ? { output } : {}),
          ...(usage !== undefined ? { usage } : {}),
          ...(result.response?.modelId ? { metadata: { model: result.response.modelId } } : {}),
        };
      } catch (error) {
        return {
          status: "failed",
          error: {
            name: error instanceof Error ? error.name : "Error",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}
