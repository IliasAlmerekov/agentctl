import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

function readInstallSection(): string {
  const readme = readFileSync("README.md", "utf8");
  const match = readme.match(/## Install\n(?<section>[\s\S]*?)\n## Usage/);

  if (!match?.groups?.section) {
    throw new Error("README.md is missing an Install section before Usage");
  }

  return match.groups.section;
}

describe("README install instructions", () => {
  test("matches the release installer pipeline", () => {
    const install = readInstallSection();

    for (const requiredText of [
      "https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh",
      "https://github.com/IliasAlmerekov/agentctl/releases",
      "`AGENTCTL_VERSION`",
      "`SHA256SUMS`",
      "`agentctl-$platform.tar.gz`",
      "`~/.agentctl/bin/`",
      "`~/.agentctl/bin/hooks/`",
      "`~/.agentctl/auth-token`",
      "`~/.claude/settings.json`",
      "launchd",
      "`systemd --user`",
      "pm2",
      "`agentctl status`",
    ]) {
      expect(install).toContain(requiredText);
    }
  });
});
