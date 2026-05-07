import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";

const INSTALL_SCRIPT = readFileSync("install.sh", "utf8");
const requireForInlineScript = createRequire(import.meta.url);

const HOOKS = {
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  SubagentStart: "subagent-start",
  SubagentStop: "subagent-stop",
} as const;

type HookEvent = keyof typeof HOOKS;
type Settings = {
  hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
};

function extractSettingsPatchScript(settingsPath: string, hooksDir: string): string {
  const startMarker = 'bun -e "\n';
  const start = INSTALL_SCRIPT.indexOf(startMarker);
  const end = INSTALL_SCRIPT.indexOf('\n"', start + startMarker.length);

  if (start === -1 || end === -1) {
    throw new Error("Could not find install settings patch script");
  }

  return INSTALL_SCRIPT.slice(start + startMarker.length, end)
    .replace(
      "const path = '$CLAUDE_SETTINGS';",
      `const path = ${JSON.stringify(settingsPath)};`,
    )
    .replace(
      "const hooksDir = '$HOOKS_DIR';",
      `const hooksDir = ${JSON.stringify(hooksDir)};`,
    )
    .replaceAll(
      "'$HOOKS_DIR/' + name",
      `${JSON.stringify(`${hooksDir}/`)} + name`,
    );
}

function runSettingsPatchScript(settingsPath: string, hooksDir: string): Settings {
  const script = extractSettingsPatchScript(settingsPath, hooksDir);
  new Function("require", script)(requireForInlineScript);
  return JSON.parse(readFileSync(settingsPath, "utf8")) as Settings;
}

function hookCommands(settings: Settings, event: HookEvent): string[] {
  return (
    settings.hooks?.[event]?.flatMap((entry) => {
      return entry.hooks?.flatMap((hook) => hook.command ?? []) ?? [];
    }) ?? []
  );
}

describe("install.sh checksum verification", () => {
  test("downloads release artifacts from the real GitHub repository", () => {
    expect(INSTALL_SCRIPT).toContain('REPO="IliasAlmerekov/agentctl"');
    expect(INSTALL_SCRIPT).toContain(
      'BASE_URL="${AGENTCTL_BASE_URL:-https://github.com/$REPO/releases/${VERSION}/download}"',
    );
    expect(INSTALL_SCRIPT).not.toContain("your-org");
    expect(INSTALL_SCRIPT).not.toContain("OWNER/REPO");
  });

  test("downloads the published checksum manifest", () => {
    expect(INSTALL_SCRIPT).toContain('CHECKSUMS_FILE="$AGENTCTL_HOME/SHA256SUMS"');
    expect(INSTALL_SCRIPT).toContain(
      'CHECKSUMS_DOWNLOAD="$DOWNLOAD_DIR/SHA256SUMS"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'curl -fsSL "$BASE_URL/SHA256SUMS" -o "$CHECKSUMS_DOWNLOAD"',
    );
  });

  test("verifies every downloaded artifact for the selected platform", () => {
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "agentctl-$PLATFORM" "$(staged_artifact_path "agentctl-$PLATFORM")"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "agentctl-daemon-$PLATFORM" "$(staged_artifact_path "agentctl-daemon-$PLATFORM")"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "pre-tool-use-$PLATFORM" "$(staged_artifact_path "pre-tool-use-$PLATFORM")"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "post-tool-use-$PLATFORM" "$(staged_artifact_path "post-tool-use-$PLATFORM")"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "subagent-start-$PLATFORM" "$(staged_artifact_path "subagent-start-$PLATFORM")"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "subagent-stop-$PLATFORM" "$(staged_artifact_path "subagent-stop-$PLATFORM")"',
    );
  });

  test("verifies checksums before installing and marking files executable", () => {
    expect(INSTALL_SCRIPT).toContain(
      "\nverify_downloads\ninstall_downloads\n\nchmod +x",
    );
  });

  test("does not replace installed binaries until checksums pass", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-checksum-home-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "agentctl-checksum-bin-"));
    const binDir = join(homeDir, ".agentctl", "bin");
    const installedCli = join(binDir, "agentctl");
    const expectedHash = createHash("sha256")
      .update("expected artifact")
      .digest("hex");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(installedCli, "known-good binary");
    chmodSync(installedCli, 0o755);

    const fakeCurl = join(fakeBinDir, "curl");
    writeFileSync(
      fakeCurl,
      `#!/usr/bin/env bash
set -euo pipefail
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      shift
      out="$1"
      ;;
    -*)
      ;;
    *)
      url="$1"
      ;;
  esac
  shift
done

mkdir -p "$(dirname "$out")"
if [[ "$url" == *"/SHA256SUMS" ]]; then
  printf '%s  agentctl-linux-x64\\n' "${expectedHash}" > "$out"
else
  printf 'tampered artifact' > "$out"
fi
`,
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync({
      cmd: ["bash", "install.sh"],
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.success).toBe(false);
    expect(stderr).toContain("Checksum mismatch for agentctl-linux-x64");
    expect(readFileSync(installedCli, "utf8")).toBe("known-good binary");
  });
});

describe("install.sh hook settings repair", () => {
  test("repairs stale agentctl hook entries and keeps unrelated hooks", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-install-"));
    const claudeDir = join(homeDir, ".claude");
    const settingsPath = join(claudeDir, "settings.json");
    const hooksDir = join(homeDir, ".agentctl", "bin", "hooks");
    const staleHooksDir = join(homeDir, "old", ".agentctl", "bin", "hooks");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: join(staleHooksDir, "pre-tool-use"),
                },
                {
                  type: "command",
                  command: "/usr/local/bin/other-pre-hook",
                },
              ],
            },
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: join(hooksDir, "pre-tool-use"),
                },
              ],
            },
          ],
          PostToolUse: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: join(staleHooksDir, "post-tool-use"),
                },
              ],
            },
          ],
          SubagentStart: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: join(staleHooksDir, "subagent-stop"),
                },
              ],
            },
          ],
        },
      }),
    );

    const settings = runSettingsPatchScript(settingsPath, hooksDir);

    expect(hookCommands(settings, "PreToolUse")).toContain(
      "/usr/local/bin/other-pre-hook",
    );

    for (const [eventName, hookName] of Object.entries(HOOKS) as Array<
      [HookEvent, string]
    >) {
      const canonicalCommand = join(hooksDir, hookName);
      const commands = hookCommands(settings, eventName);

      expect(commands.filter((command) => command === canonicalCommand)).toHaveLength(
        1,
      );
      expect(
        commands.filter((command) => {
          return (
            command.includes("/.agentctl/bin/hooks/") &&
            command !== canonicalCommand
          );
        }),
      ).toEqual([]);
    }
  });
});

describe("install.sh dry run", () => {
  test("exercises platform selection without network or home mutations", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-dry-run-home-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "agentctl-dry-run-bin-"));
    const curlLogPath = join(homeDir, "curl-called");
    const fakeCurl = join(fakeBinDir, "curl");
    writeFileSync(
      fakeCurl,
      `#!/usr/bin/env bash\necho called > ${JSON.stringify(curlLogPath)}\nexit 99\n`,
    );
    chmodSync(fakeCurl, 0o755);

    const result = Bun.spawnSync({
      cmd: ["bash", "install.sh"],
      env: {
        ...process.env,
        AGENTCTL_INSTALL_DRY_RUN: "1",
        HOME: homeDir,
        PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.success).toBe(true);
    expect(stderr).toBe("");
    expect(stdout).toContain("Dry run: would install agentctl latest for");
    expect(stdout).toContain("Dry run: would download release artifacts from");
    expect(stdout).toContain("Dry run: would patch");
    expect(stdout).toContain("Dry run: would register daemon");
    expect(existsSync(curlLogPath)).toBe(false);
    expect(existsSync(join(homeDir, ".agentctl"))).toBe(false);
    expect(existsSync(join(homeDir, ".claude", "settings.json"))).toBe(false);
  });
});
