import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const RELEASE_GATES = "docs/roadmap/08-v1-release-gates.md";

describe("v1 release gates", () => {
  test("keeps public and release-day blockers explicit", () => {
    const doc = readFileSync(RELEASE_GATES, "utf8");

    for (const requiredText of [
      "Current verdict: `NOT_READY_FOR_PUBLIC_RELEASE`",
      "public install gate",
      "repository is public",
      "public `main` installer URL returns 200",
      "install smoke gate",
      "Linux x64 and macOS",
      "smoke:install:public",
      "macOS runner evidence",
      "version/tag gate",
      "final `v1.0.0` version bump",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("marks locally verified gates with concrete evidence", () => {
    const doc = readFileSync(RELEASE_GATES, "utf8");

    for (const requiredText of [
      "build gate",
      "`bun run build` passed locally",
      "clean GitHub Actions evidence still required",
      "artifact gate",
      "all archives and `SHA256SUMS` inspected and verified",
      "test gate",
      "`bun install --frozen-lockfile`, `bun test`, and `bun run typecheck` passed locally",
      "storage gate",
      "`docs/storage.md`",
      "docs gate",
      "`docs/onboarding.md`",
      "`docs/test-strategy.md`",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("records supply-chain and release workflow gate decisions", () => {
    const doc = readFileSync(RELEASE_GATES, "utf8");

    for (const requiredText of [
      "supply-chain gate",
      "`bun run audit`",
      "No vulnerabilities found",
      "release workflow gate",
      "draft release",
      "`gh release edit --draft=false`",
      "smoke passes before publication",
    ]) {
      expect(doc).toContain(requiredText);
    }
  });

  test("root roadmap points to the remaining no-go state", () => {
    const roadmap = readFileSync("ROADMAP.md", "utf8");

    expect(roadmap).toContain("| 08 v1 release gates | P0 | Blocked |");
    expect(roadmap).toContain("Phase 08 records the current no-go blockers");
  });
});
