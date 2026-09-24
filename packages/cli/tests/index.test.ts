import { describe, expect, it } from "vitest";
import { createCli } from "../src/index.js";

describe("createCli", () => {
  it("exposes the run command and expected options", () => {
    const cli = createCli();
    const run = cli.commands.find((command) => command.name() === "run");
    expect(run).toBeDefined();
    expect(run?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--agent", "--eval", "--max-attempts", "--json"]),
    );
  });
});
