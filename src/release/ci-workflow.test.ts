import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { CHECKSUMS_FILE_NAME, getReleaseArtifacts } from "./build-artifacts.ts";

const CI_WORKFLOW = ".github/workflows/ci.yml";

describe("CI workflow", () => {
  test("runs tests, typecheck, release build, and artifact smoke checks", () => {
    expect(existsSync(CI_WORKFLOW)).toBe(true);

    const workflow = readFileSync(CI_WORKFLOW, "utf8");

    expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("uses: actions/checkout@v6");
    expect(workflow).not.toContain("uses: actions/checkout@v4");
    expect(workflow).toContain("oven-sh/setup-bun");
    expect(workflow).toContain("bun-version: 1.3.13");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("bun run check:public-install-url");
    expect(workflow).toContain("bun test");
    expect(workflow).toContain("bun run typecheck");
    expect(workflow).toContain("bun run build");
    expect(workflow).toContain(`test -s dist/${CHECKSUMS_FILE_NAME}`);

    for (const artifact of getReleaseArtifacts()) {
      const fileName = artifact.outfile.replace("dist/", "");

      expect(workflow).toContain(fileName);
      expect(workflow).toContain(`test -s "dist/$artifact"`);
      expect(workflow).toContain(
        `grep -q "  $artifact$" dist/${CHECKSUMS_FILE_NAME}`,
      );
    }

    for (const path of [
      "./agentctl",
      "./agentctl-daemon",
      "./hooks/pre-tool-use",
      "./hooks/post-tool-use",
      "./hooks/subagent-start",
      "./hooks/subagent-stop",
    ]) {
      expect(workflow).toContain(
        `tar -tzf dist/agentctl-linux-x64.tar.gz | grep -q '^\\${path}$'`,
      );
    }
  });
});
