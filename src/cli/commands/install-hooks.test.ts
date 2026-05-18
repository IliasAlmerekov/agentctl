import { describe, expect, test } from "bun:test";
import { join } from "path";
import { installAgentctlHooksInSettings } from "./install-hooks.ts";

const HOOKS = {
  PreToolUse: "pre-tool-use",
  PostToolUse: "post-tool-use",
  SubagentStart: "subagent-start",
  SubagentStop: "subagent-stop",
} as const;

type HookEvent = keyof typeof HOOKS;

function hookCommands(settings: unknown, event: HookEvent): string[] {
  const record = settings as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  };

  return (
    record.hooks?.[event]?.flatMap((entry) => {
      return entry.hooks?.flatMap((hook) => hook.command ?? []) ?? [];
    }) ?? []
  );
}

describe("installAgentctlHooksInSettings", () => {
  test("repairs stale agentctl hook entries from a custom AGENTCTL_HOME path", () => {
    const newHooksDir = "/home/user/.agentctl/bin/hooks";
    const oldCustomHooksDir = "/opt/agentctl/bin/hooks";

    const result = installAgentctlHooksInSettings(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: join(oldCustomHooksDir, "pre-tool-use"),
                },
              ],
            },
          ],
          PostToolUse: [],
          SubagentStart: [],
          SubagentStop: [],
        },
      },
      newHooksDir,
    );

    const commands = hookCommands(result.settings, "PreToolUse");
    expect(commands).not.toContain(join(oldCustomHooksDir, "pre-tool-use"));
    expect(commands).toContain(join(newHooksDir, "pre-tool-use"));
  });

  test("repairs stale agentctl hook entries and keeps unrelated hooks", () => {
    const homeDir = "/tmp/agentctl-install-home";
    const hooksDir = join(homeDir, ".agentctl", "bin", "hooks");
    const staleHooksDir = join(homeDir, "old", ".agentctl", "bin", "hooks");

    const result = installAgentctlHooksInSettings(
      {
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
      },
      hooksDir,
    );

    expect(result.repairedHooks).toBe(4);
    expect(hookCommands(result.settings, "PreToolUse")).toContain(
      "/usr/local/bin/other-pre-hook",
    );

    for (const [eventName, hookName] of Object.entries(HOOKS) as Array<
      [HookEvent, string]
    >) {
      const canonicalCommand = join(hooksDir, hookName);
      const commands = hookCommands(result.settings, eventName);

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
