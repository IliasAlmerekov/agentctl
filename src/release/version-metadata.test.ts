import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const RELEASE_VERSION = "0.2.0";
const RELEASE_TAG = `v${RELEASE_VERSION}`;

describe("release version metadata", () => {
  test("package and CLI expose the same public beta version", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      version?: string;
    };
    const cli = readFileSync("src/cli/index.ts", "utf8");

    expect(packageJson.version).toBe(RELEASE_VERSION);
    expect(cli).toContain(`.version("${RELEASE_VERSION}")`);
  });

  test("public install docs pin the current public release tag", () => {
    for (const path of ["README.md", "docs/onboarding.md"] as const) {
      const doc = readFileSync(path, "utf8");

      expect(doc, `${path} should pin ${RELEASE_TAG}`).toContain(
        `AGENTCTL_VERSION=${RELEASE_TAG}`,
      );
      expect(doc, `${path} should not pin the old beta tag`).not.toContain(
        "AGENTCTL_VERSION=v0.1.0-beta.1",
      );
    }
  });
});
