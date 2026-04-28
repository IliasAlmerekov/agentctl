import { Command } from "commander";
import { cmdInject } from "./commands/inject.ts";
import { cmdCap } from "./commands/cap.ts";
import { cmdKill } from "./commands/kill.ts";
import { cmdAgents } from "./commands/agents.ts";
import { cmdWatch } from "./commands/watch.tsx";
import { apiStatus } from "./api.ts";

const program = new Command();

program
  .name("agentctl")
  .description("Sub-agent control plane for Claude Code")
  .version("0.1.0");

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

program
  .command("cap <session-id>")
  .description("Cap token budget for an agent")
  .requiredOption("--tokens <n>", "Token budget cap", parseInt)
  .action((sessionId, opts) => cmdCap(sessionId, opts.tokens));

program
  .command("kill <session-id>")
  .description("Kill one specific agent without stopping others")
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

program.parse(process.argv);
