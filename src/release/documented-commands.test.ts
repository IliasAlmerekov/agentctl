import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const DOCS = ["README.md", "AGENTCTL.md"] as const;

function implementedCommands(): Set<string> {
  const cli = readFileSync("src/cli/index.ts", "utf8");
  return new Set(
    [...cli.matchAll(/\.command\("([^" <]+)/g)].map((match) => match[1]),
  );
}

function documentedCommands(doc: string): string[] {
  const fencedBlocks = [
    ...doc.matchAll(/```(?:bash)?\n(?<block>[\s\S]*?)```/g),
  ];

  return fencedBlocks.flatMap((match) => {
    return [...match.groups!.block.matchAll(/^agentctl\s+([a-z-]+)/gm)].map(
      (command) => command[1],
    );
  });
}

describe("documented CLI commands", () => {
  test("README and AGENTCTL only list implemented commands", () => {
    const commands = implementedCommands();

    for (const path of DOCS) {
      for (const command of documentedCommands(readFileSync(path, "utf8"))) {
        expect(commands.has(command), `${path} documents agentctl ${command}`).toBe(
          true,
        );
      }
    }
  });

  test("primary docs label command lists as implemented", () => {
    expect(readFileSync("README.md", "utf8")).toContain("Implemented commands");
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain("Implemented commands");
  });
});
