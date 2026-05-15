import { Command, InvalidArgumentError } from "commander";
import { cmdInject } from "./commands/inject.ts";
import { cmdCap, parseCapTokens } from "./commands/cap.ts";
import { cmdKill } from "./commands/kill.ts";
import { cmdAgents } from "./commands/agents.ts";
import { cmdWatch } from "./commands/watch.tsx";
import { cmdUninstall } from "./commands/uninstall.ts";
import { cmdInstallHooks } from "./commands/install-hooks.ts";
import { apiStatus } from "./api.ts";

const program = new Command();

program
  .name("agentctl")
  .description("Sub-agent control plane for Claude Code")
  .version("0.2.0");

program
  .command("agents")
  .description("List all agents (current and recent sessions)")
  .option("--json", "Output as JSON")
  .action((opts) => cmdAgents(opts));

program
  .command("watch")
  .description("Live TUI — agent tree with token bars and loop alerts")
  .action(() => cmdWatch());

program
  .command("inject <session-id> <message>")
  .description("Inject a steering signal into a running agent")
  .action((sessionId, message) => cmdInject(sessionId, message));

function parseTokensOption(raw: string): number {
  const parsed = parseCapTokens(raw);
  if (parsed === null) {
    throw new InvalidArgumentError("must be a positive integer");
  }
  return parsed;
}

program
  .command("cap <session-id>")
  .description("Cap token budget for an agent")
  .requiredOption("--tokens <n>", "Token budget cap", parseTokensOption)
  .action((sessionId, opts) => cmdCap(sessionId, opts.tokens));

program
  .command("stop-next-tool-call <session-id>")
  .description("Schedule one specific agent to stop at its next tool call")
  .action((sessionId) => cmdKill(sessionId));

program
  .command("kill <session-id>")
  .description("Compatibility alias for stop-next-tool-call")
  .action((sessionId) => cmdKill(sessionId));

program
  .command("status")
  .description("Show daemon status")
  .action(async () => {
    try {
      const s = await apiStatus();
      console.log(`daemon: ok  running: ${s.running}  total: ${s.total}`);
    } catch {
      console.error("daemon: not running");
      process.exit(1);
    }
  });

program
  .command("install-hooks")
  .description("Install agentctl hook entries into Claude settings")
  .requiredOption("--settings <path>", "Claude settings.json path")
  .requiredOption("--hooks-dir <path>", "agentctl hooks directory")
  .action((opts: { settings?: string; hooksDir?: string }) =>
    cmdInstallHooks(opts),
  );

program
  .command("uninstall")
  .description("Remove agentctl hooks, daemon registration, and local files")
  .action(() => cmdUninstall());

program.parse(process.argv);
