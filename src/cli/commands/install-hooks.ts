import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";

type HookSettings = {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
};

type HookEntry = {
  hooks?: unknown;
  [key: string]: unknown;
};

export type InstallHooksOptions = {
  settingsPath: string;
  hooksDir: string;
};

export type InstallHooksResult = {
  settings: HookSettings;
  repairedHooks: number;
};

const HOOK_EVENTS = {
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  SubagentStart: "subagent-start",
  SubagentStop: "subagent-stop",
} as const;

const MANAGED_HOOK_NAMES = new Set(Object.values(HOOK_EVENTS));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Matches commands that were written by agentctl regardless of AGENTCTL_HOME location.
// Agentctl always places hooks at $AGENTCTL_HOME/bin/hooks/<name>, so /bin/hooks/<managed-name>
// is a sufficiently unique pattern. New entries also carry _agentctl:true on their parent entry.
const MANAGED_HOOK_PATH_RE = new RegExp(
  `/bin/hooks/(${Array.from(MANAGED_HOOK_NAMES).join("|")})$`,
);

function isManagedAgentctlHookCommand(command: unknown, hooksDir: string): boolean {
  if (typeof command !== "string") return false;

  const name = command.split("/").pop();
  if (!name || !MANAGED_HOOK_NAMES.has(name as (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS])) {
    return false;
  }

  return command.startsWith(`${hooksDir}/`) || MANAGED_HOOK_PATH_RE.test(command);
}

function isManagedAgentctlEntry(entry: unknown): boolean {
  return isRecord(entry) && entry._agentctl === true;
}

function repairExistingHookEntries(
  entries: unknown,
  hooksDir: string,
): { entries: unknown[]; repaired: number } {
  if (!Array.isArray(entries)) {
    return { entries: [], repaired: 0 };
  }

  let repaired = 0;
  const repairedEntries = entries
    .map((entry: HookEntry) => {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) return entry;

      if (isManagedAgentctlEntry(entry)) {
        repaired += entry.hooks.length;
        return null;
      }

      const keptHooks = entry.hooks.filter((hook) => {
        if (!isRecord(hook)) return true;

        const remove = isManagedAgentctlHookCommand(hook.command, hooksDir);
        if (remove) repaired += 1;
        return !remove;
      });

      return { ...entry, hooks: keptHooks };
    })
    .filter((entry): entry is HookEntry => entry !== null)
    .filter((entry: HookEntry) => {
      return !isRecord(entry) || !Array.isArray(entry.hooks) || entry.hooks.length > 0;
    });

  return { entries: repairedEntries, repaired };
}

export function installAgentctlHooksInSettings(
  settings: HookSettings,
  hooksDir: string,
): InstallHooksResult {
  const next = JSON.parse(JSON.stringify(settings)) as HookSettings;
  if (!isRecord(next.hooks)) {
    next.hooks = {};
  }

  let repairedHooks = 0;

  for (const [eventName, hookName] of Object.entries(HOOK_EVENTS)) {
    const repaired = repairExistingHookEntries(next.hooks[eventName], hooksDir);
    repairedHooks += repaired.repaired;
    next.hooks[eventName] = [
      ...repaired.entries,
      {
        _agentctl: true,
        matcher: "",
        hooks: [{ type: "command", command: join(hooksDir, hookName) }],
      },
    ];
  }

  return { settings: next, repairedHooks };
}

export function installAgentctlHooks(
  options: InstallHooksOptions,
): InstallHooksResult {
  mkdirSync(dirname(options.settingsPath), { recursive: true });

  const settings = existsSync(options.settingsPath)
    ? (JSON.parse(readFileSync(options.settingsPath, "utf8")) as HookSettings)
    : {};
  const result = installAgentctlHooksInSettings(settings, options.hooksDir);

  writeFileSync(
    options.settingsPath,
    `${JSON.stringify(result.settings, null, 2)}\n`,
  );

  return result;
}

export async function cmdInstallHooks(options: {
  settings?: string;
  hooksDir?: string;
}) {
  try {
    if (!options.settings) throw new Error("--settings is required");
    if (!options.hooksDir) throw new Error("--hooks-dir is required");

    const result = installAgentctlHooks({
      settingsPath: options.settings,
      hooksDir: options.hooksDir,
    });

    if (result.repairedHooks > 0) {
      console.log(`Repaired ${result.repairedHooks} existing agentctl hook entries`);
    }
    console.log("Patched ~/.claude/settings.json");
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
