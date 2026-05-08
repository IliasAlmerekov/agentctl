import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { RELEASE_PLATFORMS } from "./build-artifacts.ts";

const PLATFORM_DOC = "docs/platforms.md";

describe("platform support documentation", () => {
  test("documents every supported release platform", () => {
    const doc = readFileSync(PLATFORM_DOC, "utf8");

    for (const platform of RELEASE_PLATFORMS) {
      expect(doc).toContain(platform.name);
      expect(doc).toContain(platform.bunTarget);
    }
  });

  test("documents unsupported platform families explicitly", () => {
    const doc = readFileSync(PLATFORM_DOC, "utf8");

    for (const unsupported of [
      "Windows",
      "Linux arm64",
      "macOS architectures other than arm64 and x64",
      "remote daemon",
      "Unsupported platform",
    ]) {
      expect(doc).toContain(unsupported);
    }
  });

  test("documents release build prerequisites", () => {
    const doc = readFileSync(PLATFORM_DOC, "utf8");

    for (const prerequisite of [
      "Bun 1.3.13",
      "`tar`",
      "network access",
      "Bun compile targets",
      "`sha256sum` or `shasum`",
    ]) {
      expect(doc).toContain(prerequisite);
    }
  });

  test("primary docs link the platform matrix", () => {
    expect(readFileSync("README.md", "utf8")).toContain(PLATFORM_DOC);
    expect(readFileSync("AGENTCTL.md", "utf8")).toContain(PLATFORM_DOC);
  });
});
