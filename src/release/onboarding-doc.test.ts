import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";

const ONBOARDING_DOC = "docs/onboarding.md";

describe("external onboarding documentation", () => {
  test("walks a new user from install to first status check", () => {
    expect(existsSync(ONBOARDING_DOC)).toBe(true);
    const doc = readFileSync(ONBOARDING_DOC, "utf8");

    for (const requiredText of [
      "curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash",
      "AGENTCTL_VERSION",
      "agentctl status",
      "daemon: ok",
      "agentctl agents",
      "agentctl watch",
      "agentctl inject",
      "agentctl cap",
      "agentctl stop-next-tool-call",
      "agentctl uninstall",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("explains managed hooks, internal install-hooks, and fail-open behavior", () => {
    const doc = readFileSync(ONBOARDING_DOC, "utf8");

    for (const requiredText of [
      "~/.claude/settings.json",
      "~/.agentctl/bin/hooks/pre-tool-use",
      "~/.agentctl/bin/hooks/post-tool-use",
      "~/.agentctl/bin/hooks/subagent-start",
      "~/.agentctl/bin/hooks/subagent-stop",
      "install-hooks",
      "internal installer command",
      "fail open",
      "docs/hook-contract.md",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("covers recovery paths, supported artifacts, and known limitations", () => {
    const doc = readFileSync(ONBOARDING_DOC, "utf8");

    for (const requiredText of [
      "Missing or empty auth token",
      "Port conflict",
      "Daemon unavailable",
      "Stale DB",
      "PATH",
      "Hook config conflicts",
      "docs/troubleshooting.md",
      "agentctl-darwin-arm64.tar.gz",
      "agentctl-darwin-x64.tar.gz",
      "agentctl-linux-x64.tar.gz",
      "no Windows",
      "no Linux arm64",
      "no remote daemon",
      "no Web UI",
      "not a sandbox",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("primary docs link onboarding", () => {
    expect(readFileSync("README.md", "utf8")).toContain(ONBOARDING_DOC);
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain(ONBOARDING_DOC);
  });
});
