import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";

const TEST_STRATEGY_DOC = "docs/test-strategy.md";

describe("v1 test strategy documentation", () => {
  test("defines the mandatory local pre-release command set", () => {
    expect(existsSync(TEST_STRATEGY_DOC)).toBe(true);
    const doc = readFileSync(TEST_STRATEGY_DOC, "utf8");

    for (const command of [
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun install --frozen-lockfile',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run typecheck',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run build',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install',
      'rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run measure:hooks',
    ]) {
      expect(doc).toContain(command);
    }
  });

  test("assigns verification owners for audit unknowns and existing coverage", () => {
    const doc = readFileSync(TEST_STRATEGY_DOC, "utf8");

    for (const evidence of [
      "WebSocket reconnect/disconnect",
      "src/cli/commands/watch.test.ts",
      "Malformed daemon JSON",
      "src/daemon/http.test.ts",
      "Invalid CLI input",
      "src/cli/commands/inject.test.ts",
      "src/cli/commands/cap.test.ts",
      "Storage migration compatibility",
      "src/daemon/db.test.ts",
      "DB failure behavior",
      "docs/storage.md",
      "Release archive contents",
      "src/release/build-artifacts.test.ts",
      "Checksum manifest",
      "src/release/ci-workflow.test.ts",
    ]) {
      expect(doc).toContain(evidence);
    }
  });

  test("documents manual checks, lint policy, and test taxonomy", () => {
    const doc = readFileSync(TEST_STRATEGY_DOC, "utf8");

    for (const requiredText of [
      "Manual TUI checklist",
      "non-TTY",
      "terminal resize",
      "`q` exits",
      "macOS release smoke",
      "Lint policy",
      "no `lint` script is required for v1.0.0",
      "Test taxonomy",
      "Unit",
      "Integration",
      "Release",
      "Docs",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("phase roadmap links the durable strategy document", () => {
    expect(readFileSync("docs/roadmap/06-test-strategy-for-v1.md", "utf8")).toContain(
      TEST_STRATEGY_DOC,
    );
    expect(readFileSync("ROADMAP.md", "utf8")).toContain(TEST_STRATEGY_DOC);
  });
});
