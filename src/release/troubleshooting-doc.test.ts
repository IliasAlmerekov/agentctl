import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const TROUBLESHOOTING_DOC = "docs/troubleshooting.md";

describe("troubleshooting documentation", () => {
  test("covers required beta recovery scenarios", () => {
    const doc = readFileSync(TROUBLESHOOTING_DOC, "utf8");

    for (const requiredText of [
      "daemon: not running",
      "`agentctl status`",
      "`~/.agentctl/daemon.log`",
      "`~/.agentctl/daemon.error.log`",
      "launchd",
      "`systemd --user`",
      "pm2",
      "Bun/PATH",
      "Installed release binaries and `install.sh` do not require Bun",
      "`~/.agentctl/bin`",
      "`~/.bun/bin`",
      "stale",
      "`~/.agentctl/agents.db`",
      "hook config conflicts",
      "`~/.claude/settings.json`",
      "`agentctl uninstall`",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("primary docs link troubleshooting", () => {
    expect(readFileSync("README.md", "utf8")).toContain(TROUBLESHOOTING_DOC);
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain(TROUBLESHOOTING_DOC);
  });
});
