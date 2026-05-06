import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";

type HookSettings = {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
};

type HookEntry = {
  hooks?: unknown;
  [key: string]: unknown;
};

export type RunCommand = (cmd: string[]) => { ok: boolean; error?: string };

export type UninstallOptions = {
  homeDir?: string;
  platform?: NodeJS.Platform;
  runCommand?: RunCommand;
};

export type UninstallResult = {
  hooksRemoved: number;
  settingsUpdated: boolean;
  homeRemoved: boolean;
  serviceStopped: boolean;
  warnings: string[];
};

const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
];

function defaultRunCommand(cmd: string[]): { ok: boolean; error?: string } {
  const result = Bun.spawnSync({
    cmd,
    stdout: "ignore",
    stderr: "pipe",
  });
  return {
    ok: result.success,
    error: result.stderr ? new TextDecoder().decode(result.stderr) : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAgentctlHookCommand(command: unknown, hooksDir: string): boolean {
  return typeof command === "string" && command.startsWith(`${hooksDir}/`);
}

export function removeAgentctlHooksFromSettings(
  settings: HookSettings,
  hooksDir: string,
): { settings: HookSettings; removed: number } {
  const next = JSON.parse(JSON.stringify(settings)) as HookSettings;
  let removed = 0;

  if (!isRecord(next.hooks)) {
    return { settings: next, removed };
  }

  for (const eventName of HOOK_EVENTS) {
    const entries = next.hooks[eventName];
    if (!Array.isArray(entries)) continue;

    next.hooks[eventName] = entries
      .map((entry: HookEntry) => {
        if (!Array.isArray(entry.hooks)) return entry;

        const keptHooks = entry.hooks.filter((hook) => {
          if (!isRecord(hook)) return true;
          const keep = !isAgentctlHookCommand(hook.command, hooksDir);
          if (!keep) removed += 1;
          return keep;
        });

        return { ...entry, hooks: keptHooks };
      })
      .filter((entry: HookEntry) => {
        return !Array.isArray(entry.hooks) || entry.hooks.length > 0;
      });
  }

  return { settings: next, removed };
}

function stopDaemon(
  homeDir: string,
  platform: NodeJS.Platform,
  runCommand: RunCommand,
  warnings: string[],
): boolean {
  const agentctlHome = join(homeDir, ".agentctl");

  if (platform === "darwin") {
    const plist = join(agentctlHome, "agentctl-daemon.plist");
    if (!existsSync(plist)) return false;
    const result = runCommand(["launchctl", "unload", plist]);
    if (!result.ok) warnings.push(result.error ?? "launchctl unload failed");
    return result.ok;
  }

  if (platform === "linux") {
    const servicePath = join(
      homeDir,
      ".config",
      "systemd",
      "user",
      "agentctl-daemon.service",
    );
    if (!existsSync(servicePath)) return false;

    const stopResult = runCommand([
      "systemctl",
      "--user",
      "disable",
      "--now",
      "agentctl-daemon",
    ]);
    if (!stopResult.ok) {
      warnings.push(stopResult.error ?? "systemctl disable failed");
    }

    rmSync(servicePath, { force: true });
    const reloadResult = runCommand(["systemctl", "--user", "daemon-reload"]);
    if (!reloadResult.ok) {
      warnings.push(reloadResult.error ?? "systemctl daemon-reload failed");
    }

    return stopResult.ok && reloadResult.ok;
  }

  const result = runCommand(["pm2", "delete", "agentctl-daemon"]);
  if (!result.ok) warnings.push(result.error ?? "pm2 delete failed");
  return result.ok;
}

export function uninstallAgentctl(
  options: UninstallOptions = {},
): UninstallResult {
  const homeDir = options.homeDir ?? process.env.HOME;
  if (!homeDir) throw new Error("HOME is not set");

  const runCommand = options.runCommand ?? defaultRunCommand;
  const platform = options.platform ?? process.platform;
  const agentctlHome = join(homeDir, ".agentctl");
  const hooksDir = join(agentctlHome, "bin", "hooks");
  const settingsPath = join(homeDir, ".claude", "settings.json");
  const warnings: string[] = [];
  let hooksRemoved = 0;
  let settingsUpdated = false;

  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as HookSettings;
    const updated = removeAgentctlHooksFromSettings(settings, hooksDir);
    hooksRemoved = updated.removed;
    if (hooksRemoved > 0) {
      writeFileSync(settingsPath, `${JSON.stringify(updated.settings, null, 2)}\n`);
      settingsUpdated = true;
    }
  }

  const serviceStopped = stopDaemon(homeDir, platform, runCommand, warnings);

  let homeRemoved = false;
  if (existsSync(agentctlHome)) {
    rmSync(agentctlHome, { recursive: true, force: true });
    homeRemoved = true;
  }

  return {
    hooksRemoved,
    settingsUpdated,
    homeRemoved,
    serviceStopped,
    warnings,
  };
}

export function formatUninstallResult(result: UninstallResult): string {
  return [
    "✓ agentctl uninstalled",
    `hooks removed: ${result.hooksRemoved}`,
    `agentctl home removed: ${result.homeRemoved ? "yes" : "no"}`,
  ].join("\n");
}

export async function cmdUninstall() {
  try {
    const result = uninstallAgentctl();
    console.log(formatUninstallResult(result));
    for (const warning of result.warnings) {
      console.error(`warning: ${warning.trim()}`);
    }
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
