import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const RELEASE_NOTES = "docs/release-notes.md";

describe("public launch release notes", () => {
  test("state working commands, platforms, limits, recovery, and checksums", () => {
    const notes = readFileSync(RELEASE_NOTES, "utf8");

    for (const requiredText of [
      "First Public Beta Release Notes",
      "`agentctl agents`",
      "`agentctl watch`",
      "`agentctl status`",
      "`agentctl inject`",
      "`agentctl cap`",
      "`agentctl kill`",
      "`agentctl uninstall`",
      "macOS Apple Silicon",
      "macOS Intel",
      "Linux x64",
      "local single-user only",
      "no Windows",
      "no Linux arm64",
      "no remote daemon",
      "no Web UI",
      "not a sandbox against same-user code",
      "hooks fail open when agentctl is unavailable",
      "docs/troubleshooting.md",
      "docs/security.md",
      "docs/out-of-scope.md",
      "SHA256SUMS",
      "verifies",
    ]) {
      expect(notes).toContain(requiredText);
    }
  });

  test("primary release docs link the launch release notes", () => {
    expect(readFileSync("README.md", "utf8")).toContain(RELEASE_NOTES);
    expect(readFileSync("CHANGELOG.md", "utf8")).toContain(RELEASE_NOTES);
  });
});
