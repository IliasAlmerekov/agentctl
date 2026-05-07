import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  removeAgentctlHooksFromSettings,
  uninstallAgentctl,
} from "./uninstall.ts";

describe("removeAgentctlHooksFromSettings", () => {
  test("removes only agentctl hook commands and keeps unrelated hooks", () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "/tmp/home/.agentctl/bin/hooks/pre-tool-use",
              },
              {
                type: "command",
                command: "/usr/local/bin/other-hook",
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
                command: "/tmp/home/.agentctl/bin/hooks/post-tool-use",
              },
            ],
          },
        ],
      },
    };

    const result = removeAgentctlHooksFromSettings(
      settings,
      "/tmp/home/.agentctl/bin/hooks",
    );

    expect(result.removed).toBe(2);
    expect(result.settings).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "/usr/local/bin/other-hook",
              },
            ],
          },
        ],
        PostToolUse: [],
      },
    });
  });
});

describe("uninstallAgentctl", () => {
  test("removes installed hooks and the agentctl home directory", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-home-"));
    const agentctlHome = join(homeDir, ".agentctl");
    const hooksDir = join(agentctlHome, "bin", "hooks");
    const claudeDir = join(homeDir, ".claude");
    const settingsPath = join(claudeDir, "settings.json");
    mkdirSync(hooksDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(agentctlHome, "agentctl-daemon.plist"), "plist");
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
                  command: join(hooksDir, "pre-tool-use"),
                },
              ],
            },
          ],
        },
      }),
    );
    const commands: string[][] = [];

    const result = uninstallAgentctl({
      homeDir,
      platform: "darwin",
      runCommand: (cmd) => {
        commands.push(cmd);
        return { ok: true };
      },
    });

    expect(result.hooksRemoved).toBe(1);
    expect(result.homeRemoved).toBe(true);
    expect(result.serviceStopped).toBe(true);
    expect(existsSync(agentctlHome)).toBe(false);
    expect(commands).toContainEqual([
      "launchctl",
      "unload",
      join(agentctlHome, "agentctl-daemon.plist"),
    ]);
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      hooks: {
        PreToolUse: [],
      },
    });
  });

  test("removes the user systemd service file on Linux", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-home-"));
    const agentctlHome = join(homeDir, ".agentctl");
    const serviceDir = join(homeDir, ".config", "systemd", "user");
    const servicePath = join(serviceDir, "agentctl-daemon.service");
    mkdirSync(agentctlHome, { recursive: true });
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(servicePath, "service");
    const commands: string[][] = [];

    const result = uninstallAgentctl({
      homeDir,
      platform: "linux",
      runCommand: (cmd) => {
        commands.push(cmd);
        return { ok: true };
      },
    });

    expect(result.serviceStopped).toBe(true);
    expect(existsSync(servicePath)).toBe(false);
    expect(commands).toContainEqual([
      "systemctl",
      "--user",
      "disable",
      "--now",
      "agentctl-daemon",
    ]);
    expect(commands).toContainEqual(["systemctl", "--user", "daemon-reload"]);
  });

  test("does not warn when a stale Linux service file is not registered", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-home-"));
    const agentctlHome = join(homeDir, ".agentctl");
    const serviceDir = join(homeDir, ".config", "systemd", "user");
    const servicePath = join(serviceDir, "agentctl-daemon.service");
    mkdirSync(agentctlHome, { recursive: true });
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(servicePath, "service");

    const result = uninstallAgentctl({
      homeDir,
      platform: "linux",
      runCommand: (cmd) => {
        if (cmd[0] === "systemctl" && cmd.includes("disable")) {
          return {
            ok: false,
            error: "Failed to disable unit: Unit file agentctl-daemon.service does not exist.",
          };
        }
        return { ok: true };
      },
    });

    expect(result.serviceStopped).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(existsSync(servicePath)).toBe(false);
  });

  test("removes the pm2 daemon fallback when no Linux systemd service exists", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-home-"));
    const agentctlHome = join(homeDir, ".agentctl");
    mkdirSync(agentctlHome, { recursive: true });
    const commands: string[][] = [];

    const result = uninstallAgentctl({
      homeDir,
      platform: "linux",
      runCommand: (cmd) => {
        commands.push(cmd);
        return { ok: true };
      },
    });

    expect(result.serviceStopped).toBe(true);
    expect(commands).toContainEqual(["pm2", "delete", "agentctl-daemon"]);
    expect(existsSync(agentctlHome)).toBe(false);
  });

  test("does not warn when no daemon registration exists and pm2 is unavailable", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "agentctl-home-"));
    const agentctlHome = join(homeDir, ".agentctl");
    mkdirSync(agentctlHome, { recursive: true });

    const result = uninstallAgentctl({
      homeDir,
      platform: "linux",
      runCommand: () => {
        throw Object.assign(new Error("Executable not found in $PATH: pm2"), {
          code: "ENOENT",
        });
      },
    });

    expect(result.serviceStopped).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.homeRemoved).toBe(true);
    expect(existsSync(agentctlHome)).toBe(false);
  });
});
