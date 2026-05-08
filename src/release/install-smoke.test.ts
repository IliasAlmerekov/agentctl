import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";

const INSTALL_SMOKE_SCRIPT = "scripts/smoke-install.sh";
const INSTALL_SMOKE_WORKFLOW = ".github/workflows/install-smoke.yml";
const RELEASE_WORKFLOW = ".github/workflows/release.yml";

describe("install smoke workflow", () => {
  test("exposes a package script for fresh install smoke checks", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["smoke:install"]).toBe(
      "bash scripts/smoke-install.sh",
    );
    expect(packageJson.scripts?.["smoke:install:public"]).toBe(
      "AGENTCTL_SMOKE_INSTALL_SOURCE=public bash scripts/smoke-install.sh",
    );
    expect(existsSync(INSTALL_SMOKE_SCRIPT)).toBe(true);
  });

  test("installer supports local release artifacts and registration skipping", () => {
    const install = readFileSync("install.sh", "utf8");

    expect(install).toContain("AGENTCTL_BASE_URL");
    expect(install).toContain("AGENTCTL_SKIP_DAEMON_REGISTRATION");
    expect(install).toContain("Skipping daemon registration");
  });

  test("CI can run the smoke check on Linux and macOS targets", () => {
    expect(existsSync(INSTALL_SMOKE_WORKFLOW)).toBe(true);
    const workflow = readFileSync(INSTALL_SMOKE_WORKFLOW, "utf8");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("uses: actions/checkout@v6");
    expect(workflow).toContain("bun-version: 1.3.13");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun run smoke:install");
  });

  test("smoke script can install from the public release URL and verifies uninstall", () => {
    const script = readFileSync(INSTALL_SMOKE_SCRIPT, "utf8");

    expect(script).toContain("AGENTCTL_SMOKE_INSTALL_SOURCE");
    expect(script).toContain(
      "https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh",
    );
    expect(script).toContain('curl -fsSL "$PUBLIC_INSTALL_URL" | bash');
    expect(script).toContain("AGENTCTL_VERSION is required for public install smoke");
    expect(script).toContain('"$HOME/.agentctl/bin/agentctl" status');
    expect(script).toContain('"$HOME/.agentctl/bin/agentctl" uninstall');
    expect(script).toContain("agentctl-daemon.service");
    expect(script).toContain("agentctl-daemon.plist");
    expect(script).toContain('test ! -e "$HOME/.agentctl"');
    expect(script).toContain('test ! -e "$SMOKE_SERVICE_PATH"');
    expect(script).toContain('! grep -q "/.agentctl/bin/hooks/" "$HOME/.claude/settings.json"');
  });

  test("smoke script can install from predownloaded private release assets", () => {
    const script = readFileSync(INSTALL_SMOKE_SCRIPT, "utf8");

    expect(script).toContain('"release-assets"');
    expect(script).toContain(
      "AGENTCTL_BASE_URL is required for release-assets install smoke",
    );
    expect(script).toContain('bash "$ROOT/install.sh"');
  });

  test("release workflow smokes draft release assets before publishing", () => {
    expect(existsSync(RELEASE_WORKFLOW)).toBe(true);
    const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("release-smoke:");
    expect(
      workflow,
      "smoke must run on the draft (build-release), not after publish",
    ).toContain("needs: build-release");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("uses: actions/checkout@v6");
    expect(workflow).toContain("AGENTCTL_VERSION: ${{ github.ref_name }}");
    expect(workflow).toContain("gh release download");
    expect(workflow).toContain("AGENTCTL_SMOKE_INSTALL_SOURCE: release-assets");
    expect(workflow).toContain(
      "AGENTCTL_BASE_URL: file://${{ runner.temp }}/agentctl-release-assets",
    );
    expect(workflow).toContain("bash scripts/smoke-install.sh");
  });
});
