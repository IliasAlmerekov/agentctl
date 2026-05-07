import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";

const INSTALL_SMOKE_SCRIPT = "scripts/smoke-install.sh";
const INSTALL_SMOKE_WORKFLOW = ".github/workflows/install-smoke.yml";

describe("install smoke workflow", () => {
  test("exposes a package script for fresh install smoke checks", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["smoke:install"]).toBe(
      "bash scripts/smoke-install.sh",
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
});
