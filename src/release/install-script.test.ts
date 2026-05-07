import { describe, expect, test } from "bun:test";
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
  test("downloads the published checksum manifest", () => {
    expect(INSTALL_SCRIPT).toContain('CHECKSUMS_FILE="$AGENTCTL_HOME/SHA256SUMS"');
    expect(INSTALL_SCRIPT).toContain(
      'curl -fsSL "$BASE_URL/SHA256SUMS" -o "$CHECKSUMS_FILE"',
    );
  });

  test("verifies every downloaded artifact for the selected platform", () => {
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "agentctl-$PLATFORM" "$BIN_DIR/agentctl"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "agentctl-daemon-$PLATFORM" "$BIN_DIR/agentctl-daemon"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "pre-tool-use-$PLATFORM" "$HOOKS_DIR/pre-tool-use"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "post-tool-use-$PLATFORM" "$HOOKS_DIR/post-tool-use"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "subagent-start-$PLATFORM" "$HOOKS_DIR/subagent-start"',
    );
    expect(INSTALL_SCRIPT).toContain(
      'verify_checksum "subagent-stop-$PLATFORM" "$HOOKS_DIR/subagent-stop"',
    );
  });

  test("verifies checksums before marking downloaded files executable", () => {
    expect(INSTALL_SCRIPT.indexOf("verify_downloads")).toBeGreaterThan(-1);
    expect(INSTALL_SCRIPT.indexOf("verify_downloads")).toBeLessThan(
      INSTALL_SCRIPT.indexOf("chmod +x"),
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
