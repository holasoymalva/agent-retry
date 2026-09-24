import type { AgentAdapter, AgentDescriptor } from "./types.js";

/** In-memory registry used by switch-agent recovery. */
export class AgentRegistry {
  readonly #agents = new Map<string, AgentAdapter>();

  constructor(agents: readonly AgentAdapter[] = []) {
    for (const agent of agents) this.register(agent);
  }

  register(agent: AgentAdapter): void {
    if (this.#agents.has(agent.id)) throw new Error(`Agent '${agent.id}' is already registered`);
    this.#agents.set(agent.id, agent);
  }

  get(id: string): AgentAdapter | undefined {
    return this.#agents.get(id);
  }

  list(): readonly AgentDescriptor[] {
    return [...this.#agents.values()].map((agent) => ({ id: agent.id }));
  }
}
