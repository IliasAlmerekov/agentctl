import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const CONTRACT_DOC = "docs/hook-contract.md";

describe("hook blocking contract documentation", () => {
  test("documents the exit(2) contract and limitations", () => {
    const doc = readFileSync(CONTRACT_DOC, "utf8");

    for (const requiredText of [
      "`exit(2)`",
      "`stderr`",
      "`PreToolUse`",
      "`PostToolUse`",
      "`SubagentStart`",
      "`SubagentStop`",
      "fail open",
      "does not undo",
      "does not replace Claude Code permissions",
      "https://code.claude.com/docs/en/hooks",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("links the contract from primary docs", () => {
    expect(readFileSync("README.md", "utf8")).toContain(CONTRACT_DOC);
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain(CONTRACT_DOC);
  });
});
