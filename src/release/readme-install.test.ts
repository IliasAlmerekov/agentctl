import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

describe("README install instructions", () => {
  test("matches the release installer pipeline", () => {
    const readme = readFileSync("README.md", "utf8");

    for (const requiredText of [
      "https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh",
      "https://github.com/IliasAlmerekov/agentctl/releases",
      "AGENTCTL_VERSION",
      "SHA256SUMS",
      "agentctl-",
      "~/.agentctl/bin/",
      "~/.agentctl/auth-token",
      "~/.claude/settings.json",
      "launchd",
      "systemd --user",
      "pm2",
      "agentctl status",
    ]) {
      expect(readme, `README should mention ${requiredText}`).toContain(requiredText);
    }
  });
});
