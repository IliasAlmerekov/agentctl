import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { CHECKSUMS_FILE_NAME, getReleaseArtifacts } from "./build-artifacts.ts";

const RELEASE_WORKFLOW = ".github/workflows/release.yml";

describe("release workflow", () => {
  test("publishes releases from version tags with narrow write permissions", () => {
    expect(existsSync(RELEASE_WORKFLOW)).toBe(true);

    const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true");
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("- v*");
    expect(workflow).toContain("permissions:\n  contents: write");
    expect(workflow).toContain("uses: actions/checkout@v6");
    expect(workflow).not.toContain("uses: actions/checkout@v4");
    expect(workflow).toContain("oven-sh/setup-bun");
    expect(workflow).toContain("bun-version: 1.3.13");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun test");
    expect(workflow).toContain("bun run typecheck");
    expect(workflow).toContain("bun run build");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain('gh release create "$GITHUB_REF_NAME"');
    expect(workflow).toContain("--verify-tag");
    expect(workflow).toContain("--generate-notes");
  });

  test("uploads every installer artifact and checksum manifest", () => {
    expect(existsSync(RELEASE_WORKFLOW)).toBe(true);

    const workflow = readFileSync(RELEASE_WORKFLOW, "utf8");

    for (const artifact of getReleaseArtifacts()) {
      expect(workflow).toContain(artifact.outfile);
    }

    expect(workflow).toContain(`dist/${CHECKSUMS_FILE_NAME}`);
  });
});
