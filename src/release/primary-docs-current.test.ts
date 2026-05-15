import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

const PRIMARY_DOCS = ["README.md", "AGENTCTL.md"] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("primary docs current behavior", () => {
  test("primary docs describe verified release artifact installation", () => {
    for (const path of PRIMARY_DOCS) {
      const doc = read(path);

      expect(doc, `${path} should mention SHA256SUMS`).toContain("SHA256SUMS");
      expect(
        doc,
        `${path} should say checksums gate install, not just chmod`,
      ).toContain(
        "verifies `SHA256SUMS` before extracting or installing downloaded binaries",
      );
      expect(doc, `${path} should mention auth token creation`).toContain(
        "`~/.agentctl/auth-token`",
      );
      expect(doc, `${path} should mention supported platform doc`).toContain(
        "docs/platforms.md",
      );
    }
  });

  test("AGENTCTL package and scope notes match release build behavior", () => {
    const doc = read("AGENTCTL.md");

    expect(doc).toContain(
      '"build:release": "bun run src/release/build-artifacts.ts"',
    );
    expect(doc).toContain('"build": "bun run build:release"');
    expect(doc).toContain("macOS and Linux x64");
    expect(doc).toContain("CLI, daemon, and hook release artifacts");
    expect(doc).toContain("launchd, `systemd --user`, or pm2");

    for (const staleText of [
      "linux later",
      "all three binaries",
      '"build": "bun run build:hooks && bun run build:daemon && bun run build:cli"',
    ]) {
      expect(doc).not.toContain(staleText);
    }
  });

  test("primary docs describe honest unknown-session control behavior", () => {
    const readme = read("README.md");

    expect(readme).toContain("Unknown session IDs are reported as `not_found`");
    expect(readme).toContain("`inject`, `cap`, and `kill`");
    expect(read("docs/troubleshooting.md")).toContain(
      "`inject`, `cap`, or `kill` prints `not found`",
    );
  });

  test("primary docs describe token caps as approximate when hook token usage is unavailable", () => {
    const readme = read("README.md");

    expect(readme).toContain("approximate token budget");
    expect(readme).toContain("uses hook-reported `tokens_used` when Claude Code provides it");
    expect(readme).toContain("falls back to a rough JSON-size estimate");
  });

  test("primary docs describe the measured hook latency contract", () => {
    const readme = read("README.md");
    const agentctl = read("AGENTCTL.md");
    const hookContract = read("docs/hook-contract.md");

    for (const doc of [readme, agentctl, hookContract]) {
      expect(doc).toContain("<250ms");
    }

    expect(readme).not.toContain("< 150ms");
    expect(agentctl).not.toContain("< 150ms");
    expect(agentctl).not.toContain("Must exit in < 150ms");
    expect(hookContract).toContain("Fresh local Linux evidence");
    expect(hookContract).toContain("normal p95");
    expect(hookContract).toContain("daemon-unavailable p95");
  });
});
