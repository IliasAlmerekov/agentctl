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
      expect(doc, `${path} should mention auth token`).toContain("`~/.agentctl/auth-token`");
      expect(doc, `${path} should mention platform doc`).toContain("docs/platforms.md");
    }
  });

  test("AGENTCTL package and scope notes match release build behavior", () => {
    const doc = read("AGENTCTL.md");
    expect(doc).toContain('"build": "bun run build:release"');
    expect(doc).toContain("macOS and Linux x64");
    expect(doc).toContain("CLI, daemon, and hook release artifacts");
    expect(doc).toContain("launchd, `systemd --user`, or pm2");
    for (const staleText of [
      "linux later",
      '"build": "bun run build:hooks && bun run build:daemon && bun run build:cli"',
    ]) {
      expect(doc).not.toContain(staleText);
    }
  });

  test("primary docs describe honest unknown-session control behavior", () => {
    const readme = read("README.md");
    expect(readme).toContain("Unknown session IDs are reported as `not_found`");
    expect(readme).toContain("`inject`, `cap`,");
    expect(readme).toContain("`stop-next-tool-call`, and `kill`");
    const troubleshooting = read("docs/troubleshooting.md");
    expect(troubleshooting).toContain("`inject`, `cap`, `stop-next-tool-call`");
    expect(troubleshooting).toContain("or `kill` prints `not found`");
  });

  test("primary docs describe token caps as approximate", () => {
    const readme = read("README.md");
    expect(readme).toContain("approximate token budget");
    expect(readme).toContain("uses hook-reported `tokens_used` when Claude Code provides it");
    expect(readme).toContain("falls back to a rough JSON-size estimate");
  });

  test("primary docs describe stop as a next-tool-call boundary, not a process kill", () => {
    for (const path of PRIMARY_DOCS) {
      const doc = read(path);
      expect(doc, `${path} should document the honest command`).toContain(
        "agentctl stop-next-tool-call <",
      );
      expect(doc, `${path} should document boundary semantics`).toContain(
        "next tool call",
      );
      expect(doc, `${path} should document running tool limitation`).toContain(
        "does not interrupt a tool that is already running",
      );
      expect(doc, `${path} should avoid immediate-kill wording`).not.toContain(
        "Kill one agent, not all of them",
      );
      expect(doc, `${path} should avoid process-termination wording`).not.toContain(
        "Terminates a specific agent",
      );
    }
  });

  test("primary docs describe the hook latency contract", () => {
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
