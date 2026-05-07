import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { installAgentctlHooksInSettings } from "../cli/commands/install-hooks.ts";

const INSTALL_SCRIPT = readFileSync("install.sh", "utf8");

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

function runSettingsPatchScript(settingsPath: string, hooksDir: string): Settings {
  const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Settings;
  const result = installAgentctlHooksInSettings(settings, hooksDir);
  writeFileSync(settingsPath, `${JSON.stringify(result.settings, null, 2)}\n`);
  return result.settings as Settings;
}

function hookCommands(settings: Settings, event: HookEvent): string[] {
  return (
    settings.hooks?.[event]?.flatMap((entry) => {
      return entry.hooks?.flatMap((hook) => hook.command ?? []) ?? [];
    }) ?? []
  );
}

function createFakeReleaseArchive(
  distDir: string,
  platform: string,
  files: Record<string, string>,
): string {
  const payloadDir = join(distDir, `payload-${platform}`);
  mkdirSync(payloadDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(payloadDir, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    chmodSync(filePath, 0o755);
  }

  const archiveName = `agentctl-${platform}.tar.gz`;
  const archivePath = join(distDir, archiveName);
  const result = Bun.spawnSync({
    cmd: ["tar", "-czf", archivePath, "-C", payloadDir, "."],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!result.success) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }

  return archivePath;
}

function writeArchiveChecksum(distDir: string, archivePath: string): void {
  const archiveName = "agentctl-linux-x64.tar.gz";
  const archive = readFileSync(archivePath);
  writeFileSync(
    join(distDir, "SHA256SUMS"),
    `${createHash("sha256").update(archive).digest("hex")}  ${archiveName}\n`,
  );
}

function currentAgentctlCliScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail
exec ${process.execPath} run ${join(process.cwd(), "src/cli/index.ts")} "$@"
`;
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

  test("verifies the selected platform archive before extraction", () => {
    expect(INSTALL_SCRIPT).toContain('ARCHIVE="agentctl-$PLATFORM.tar.gz"');
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "$ARCHIVE" "$(staged_artifact_path "$ARCHIVE")"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'tar -xzf "$(staged_artifact_path "$ARCHIVE")" -C "$PAYLOAD_DIR"',
    );
    expect(INSTALL_SCRIPT).not.toContain(
      'curl -fsSL "$BASE_URL/agentctl-$PLATFORM"',
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
    const expectedHash = createHash("sha256").update("expected archive").digest("hex");
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
  printf '%s  agentctl-linux-x64.tar.gz\\n' "${expectedHash}" > "$out"
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
    expect(stderr).toContain("Checksum mismatch for agentctl-linux-x64.tar.gz");
    expect(readFileSync(installedCli, "utf8")).toBe("known-good binary");
  });
});

describe("install.sh runtime requirements", () => {
  test("preflights required tools before mutating the install directory", () => {
    expect(INSTALL_SCRIPT).toContain("preflight_requirements()");
    expect(INSTALL_SCRIPT).toContain("command -v curl");
    expect(INSTALL_SCRIPT).toContain("command -v sha256sum");
    expect(INSTALL_SCRIPT).toContain("command -v shasum");
    expect(INSTALL_SCRIPT).toContain("command -v tar");
    expect(INSTALL_SCRIPT).toContain("command -v openssl");
    expect(INSTALL_SCRIPT).toContain("command -v od");
    expect(INSTALL_SCRIPT).toContain("\npreflight_requirements\n\nmkdir -p \"$HOOKS_DIR\"");
  });

  test("delegates settings patching to the compiled CLI instead of Bun", () => {
    expect(INSTALL_SCRIPT).not.toContain("bun -e");
    expect(INSTALL_SCRIPT).toContain(
      '"$BIN_DIR/agentctl" install-hooks --settings "$CLAUDE_SETTINGS" --hooks-dir "$HOOKS_DIR"',
    );
  });

  test("runs from release artifacts with a clean user PATH that has no Bun", () => {
    const distDir = mkdtempSync(join(tmpdir(), "agentctl-dist-"));
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-no-bun-home-"));
    const archivePath = createFakeReleaseArchive(distDir, "linux-x64", {
      agentctl: `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "install-hooks" ]]; then
  settings=""
  hooks_dir=""
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --settings)
        shift
        settings="$1"
        ;;
      --hooks-dir)
        shift
        hooks_dir="$1"
        ;;
    esac
    shift
  done
  mkdir -p "$(dirname "$settings")"
  printf '{"hooks":{"PreToolUse":[{"matcher":"","hooks":[{"type":"command","command":"%s/pre-tool-use"}]}]}}\\n' "$hooks_dir" > "$settings"
  exit 0
fi
echo "fake agentctl"
`,
      "agentctl-daemon": "#!/usr/bin/env bash\necho agentctl-daemon\n",
      "hooks/pre-tool-use": "#!/usr/bin/env bash\necho pre-tool-use\n",
      "hooks/post-tool-use": "#!/usr/bin/env bash\necho post-tool-use\n",
      "hooks/subagent-start": "#!/usr/bin/env bash\necho subagent-start\n",
      "hooks/subagent-stop": "#!/usr/bin/env bash\necho subagent-stop\n",
    });
    const archive = readFileSync(archivePath);
    const checksumLines = [
      `${createHash("sha256").update(archive).digest("hex")}  agentctl-linux-x64.tar.gz`,
    ];

    writeFileSync(join(distDir, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);

    const result = Bun.spawnSync({
      cmd: ["bash", "install.sh"],
      env: {
        HOME: homeDir,
        PATH: "/usr/bin:/bin",
        AGENTCTL_BASE_URL: `file://${distDir}`,
        AGENTCTL_SKIP_DAEMON_REGISTRATION: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.success, stderr).toBe(true);
    expect(stdout).toContain("Skipping daemon registration");
    expect(readFileSync(join(homeDir, ".claude", "settings.json"), "utf8")).toContain(
      `${homeDir}/.agentctl/bin/hooks/pre-tool-use`,
    );
  });
});

describe("install.sh upgrade and reinstall", () => {
  test("reinstalls idempotently over existing token, stale hooks, and systemd registration", () => {
    const distDir = mkdtempSync(join(tmpdir(), "agentctl-upgrade-dist-"));
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-upgrade-home-"));
    const fakeBinDir = mkdtempSync(join(tmpdir(), "agentctl-upgrade-bin-"));
    const authTokenFile = join(homeDir, ".agentctl", "auth-token");
    const settingsPath = join(homeDir, ".claude", "settings.json");
    const hooksDir = join(homeDir, ".agentctl", "bin", "hooks");
    const staleHooksDir = join(homeDir, "previous", ".agentctl", "bin", "hooks");
    const servicePath = join(
      homeDir,
      ".config",
      "systemd",
      "user",
      "agentctl-daemon.service",
    );
    const systemctlLog = join(homeDir, "systemctl.log");
    const archivePath = createFakeReleaseArchive(distDir, "linux-x64", {
      agentctl: currentAgentctlCliScript(),
      "agentctl-daemon": "#!/usr/bin/env bash\necho agentctl-daemon\n",
      "hooks/pre-tool-use": "#!/usr/bin/env bash\necho pre-tool-use\n",
      "hooks/post-tool-use": "#!/usr/bin/env bash\necho post-tool-use\n",
      "hooks/subagent-start": "#!/usr/bin/env bash\necho subagent-start\n",
      "hooks/subagent-stop": "#!/usr/bin/env bash\necho subagent-stop\n",
    });
    writeArchiveChecksum(distDir, archivePath);

    mkdirSync(dirname(authTokenFile), { recursive: true });
    mkdirSync(dirname(settingsPath), { recursive: true });
    mkdirSync(dirname(servicePath), { recursive: true });
    writeFileSync(authTokenFile, "stable-existing-token\n");
    writeFileSync(servicePath, "[Service]\nExecStart=/stale/agentctl-daemon\n");
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
                  command: "/opt/custom/pre-tool-use",
                },
              ],
            },
          ],
        },
      }),
    );

    const fakeSystemctl = join(fakeBinDir, "systemctl");
    writeFileSync(
      fakeSystemctl,
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${JSON.stringify(systemctlLog)}
if [[ "$*" == "--user status" ]]; then
  exit 0
fi
exit 0
`,
    );
    chmodSync(fakeSystemctl, 0o755);

    const runInstall = () =>
      Bun.spawnSync({
        cmd: ["bash", "install.sh"],
        env: {
          ...process.env,
          HOME: homeDir,
          PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`,
          AGENTCTL_BASE_URL: `file://${distDir}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      });

    for (const result of [runInstall(), runInstall()]) {
      const stderr = new TextDecoder().decode(result.stderr);
      expect(result.success, stderr).toBe(true);
    }

    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Settings;
    expect(readFileSync(authTokenFile, "utf8")).toBe("stable-existing-token\n");
    expect(hookCommands(settings, "PreToolUse")).toContain(
      "/opt/custom/pre-tool-use",
    );

    for (const [eventName, hookName] of Object.entries(HOOKS) as Array<
      [HookEvent, string]
    >) {
      const canonicalCommand = join(hooksDir, hookName);
      const commands = hookCommands(settings, eventName);
      expect(commands.filter((command) => command === canonicalCommand)).toHaveLength(
        1,
      );
      expect(commands.filter((command) => command.startsWith(staleHooksDir))).toEqual(
        [],
      );
    }

    expect(readFileSync(servicePath, "utf8")).toContain(
      `ExecStart=${homeDir}/.agentctl/bin/agentctl-daemon`,
    );
    expect(readFileSync(servicePath, "utf8")).not.toContain("/stale/");
    expect(readFileSync(systemctlLog, "utf8").match(/--user enable --now/g)).toHaveLength(
      2,
    );
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
