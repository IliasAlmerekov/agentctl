import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

describe("public docs launch sync", () => {
  test("README explains beta status, platform support, and release notes", () => {
    const readme = readFileSync("README.md", "utf8");

    for (const requiredText of [
      "## Beta status",
      "first public beta",
      "macOS Apple Silicon",
      "macOS Intel",
      "Linux x64",
      "Windows and Linux arm64 are not supported",
      "CHANGELOG.md",
    ]) {
      expect(readme).toContain(requiredText);
    }

    expect(readFileSync("CHANGELOG.md", "utf8")).toContain("## Unreleased");
  });

  test("exposes a public docs drift check", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["check:public-doc-drift"]).toBe(
      "bun run scripts/check-public-doc-drift.ts",
    );
    expect(readFileSync("scripts/check-public-doc-drift.ts", "utf8")).toContain(
      "README.md",
    );
  });
});
