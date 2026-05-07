import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";

const SCRIPT = "scripts/check-public-install-url.ts";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const README_INSTALL_URL =
  "https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh";

describe("public install URL check", () => {
  test("is exposed as a package script and wired into CI", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const workflow = readFileSync(CI_WORKFLOW, "utf8");

    expect(packageJson.scripts?.["check:public-install-url"]).toBe(
      `bun run ${SCRIPT}`,
    );
    expect(workflow).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(workflow).toContain("bun run check:public-install-url");
  });

  test("checks the README install URL against the public main branch", () => {
    expect(existsSync(SCRIPT)).toBe(true);

    const script = readFileSync(SCRIPT, "utf8");

    expect(script).toContain("README.md");
    expect(script).toContain(README_INSTALL_URL);
    expect(script).toContain("fetch");
    expect(script).toContain("process.exit(1)");
  });
});
