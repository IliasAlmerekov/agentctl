import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";

describe("public repository readiness", () => {
  test("LICENSE file exists and contains MIT license text", () => {
    expect(existsSync("LICENSE"), "LICENSE file must exist").toBe(true);
    const license = readFileSync("LICENSE", "utf8");
    expect(license).toContain("MIT License");
    expect(license).toContain("Permission is hereby granted, free of charge");
    expect(license).toContain("THE SOFTWARE IS PROVIDED");
  });

  test("package.json has license field set to MIT", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
    expect(pkg["license"]).toBe("MIT");
  });

  test("package.json has public repository metadata", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      repository?: { type: string; url: string };
      bugs?: { url: string };
      homepage?: string;
    };

    expect(pkg.repository?.type).toBe("git");
    expect(pkg.repository?.url).toContain("IliasAlmerekov/agentctl");
    expect(pkg.bugs?.url).toContain("IliasAlmerekov/agentctl");
    expect(pkg.homepage).toContain("IliasAlmerekov/agentctl");
  });

  test("package.json engines field declares bun runtime requirement", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      engines?: { bun?: string };
    };

    expect(pkg.engines?.bun, "engines.bun must declare version range").toBeTruthy();
    expect(pkg.engines!.bun).toMatch(/^>=/);
  });

  test("TODO.md is excluded from git tracking via .gitignore", () => {
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(gitignore).toContain("TODO.md");
  });
});
