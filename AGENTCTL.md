# agentctl

> Sub-agent control plane for Claude Code.  
> See what agents do. Steer them mid-run. Stop runaway loops.

---

## Problem

When Claude Code runs sub-agents (via the `Task` tool), you have two options:

- **Watch** — a one-line terminal entry, no detail
- **Kill everything** — `Ctrl+F`, all context gone

There is no middle ground. You cannot redirect a specific agent. You cannot cap its token spend. You cannot inject a course correction without blowing up the whole session. And when an agent loops — calling the same tool 20 times with the same arguments — you find out after the damage is done.

The deeper problem: existing observability tools (`claude-code-hooks-multi-agent-observability` — 893 ⭐, `agents-observe`, `claude-view`) all solve **monitoring**. They show you what happened. None of them let you **act** on what you see.

**Monitoring without control is just expensive anxiety.**

The gap:

```
MONITORING  →  ✅ Solved (893⭐ repos, native Channels from Anthropic)
CONTROL     →  ❌ Unsolved — agentctl lives here
```

Real signal from GitHub Issues (open, unresolved):

- Issue #30492: _"Real-time steering: priority message channel for redirecting Claude mid-execution"_
- Issue #25408: _"Interruptible pause/wait tool with visible countdown"_
- Issue #14227: _"Claude Code starts every session with zero context. Every session that starts from zero wastes compounding value."_

---

## What agentctl does

**Three capabilities, no more:**

### 1. Inject a steering signal into a running agent

```bash
agentctl inject <agent-id> "Stop building the auth module. Use Supabase Auth instead."
```

The agent reads the message at its next tool call boundary and adjusts. No restart. No context loss. Other agents keep running.

### 2. Cap an agent's token budget

```bash
agentctl cap <agent-id> --tokens 50000
```

Once the agent hits the cap, it receives a blocking message: _"Budget exceeded. Summarise your work and stop."_ Prevents a runaway sub-agent from burning $40 on node_modules traversal.

### 3. Kill one agent, not all of them

```bash
agentctl kill <agent-id>
```

Terminates a specific agent. The orchestrator and remaining agents continue.

---

## How it works

### The injection mechanism

Claude Code cannot be injected into directly — there is no API for that. But hooks run at every tool call boundary, and a hook can **block the tool call with a reason**. Claude reads that reason as part of its context and responds to it.

```
Agent about to call Bash("find /node_modules...")
  → PreToolUse hook fires
  → Hook calls daemon: "any pending injections for this session?"
  → Daemon: "yes, inject message X"
  → Hook returns: exit(2) + reason = message X
  → Claude sees: "⚡ STEERING SIGNAL: Stop building auth. Use Supabase Auth."
  → Claude adjusts course
```

This is not a hack — it is the documented behavior of `exit(2)` in Claude Code hooks. The hook author is the operator. The operator can correct the agent.

### Loop detection

The daemon tracks every tool call: session ID, tool name, argument hash, timestamp. On each PreToolUse, it checks: has this session called this tool with these arguments 5+ times in the last 2 minutes? If yes — block with a human-readable explanation.

```
⚠️ Loop detected: Bash("grep -r TODO . --include=*.ts")
called 7× in 90 seconds. Try a different approach.
```

### Budget enforcement

Each agent has a token counter in SQLite, incremented on PostToolUse. When `tokens_used >= token_budget`, the next PreToolUse blocks:

```
⚡ AGENTCTL: Token budget exceeded (52,341 / 50,000).
Summarise your work so far and stop.
```

---

## Architecture

```
Claude Code (agent + sub-agents)
         │ tool calls
         ▼
   Hook scripts (.ts)          ← executed per tool call, < 150ms
         │ HTTP POST localhost:47823
         ▼
   agentctl daemon (Bun)       ← always-running local process
   ├── SQLite: agents.db       ← agent tree, tool calls, token counts
   ├── Loop detector           ← sliding window, arg hashing
   ├── Budget manager          ← per-agent token caps
   ├── Injection queue         ← pending steering signals
   └── WebSocket server        ← live events to TUI
         │
    ┌────┴────┐
    ▼         ▼
  CLI       Live TUI (Ink)
```

### Data model

```sql
CREATE TABLE agents (
  session_id     TEXT PRIMARY KEY,
  parent_id      TEXT REFERENCES agents(session_id),
  description    TEXT,
  status         TEXT DEFAULT 'running', -- running | done | killed | budget_exceeded
  depth          INTEGER DEFAULT 0,
  tokens_used    INTEGER DEFAULT 0,
  token_budget   INTEGER,               -- NULL = no cap
  started_at     INTEGER,
  ended_at       INTEGER
);

CREATE TABLE tool_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT REFERENCES agents(session_id),
  tool_name      TEXT,
  arg_hash       TEXT,                  -- sha1 of normalised args
  called_at      INTEGER
);
CREATE INDEX idx_loop ON tool_calls(session_id, tool_name, arg_hash, called_at);

CREATE TABLE injections (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT REFERENCES agents(session_id),
  message        TEXT,
  status         TEXT DEFAULT 'pending', -- pending | delivered
  created_at     INTEGER,
  delivered_at   INTEGER
);
```

---

## Implementation

### Tech stack

| Component    | Choice                       | Reason                                                                 |
| ------------ | ---------------------------- | ---------------------------------------------------------------------- |
| Runtime      | **Bun**                      | Hook startup ~8ms vs Node ~180ms. Claude Code has a hard hook timeout. |
| HTTP server  | `Bun.serve`                  | Built-in, zero deps, WebSocket included                                |
| Database     | `bun:sqlite`                 | Native, no bindings, WAL mode for concurrent readers                   |
| TUI          | **Ink** (React for terminal) | Declarative, composable, same mental model as React                    |
| CLI parser   | `commander`                  | Lightweight, well-typed                                                |
| Distribution | `bun build --compile`        | Single binary per platform, no runtime required                        |

### File structure

```
agentctl/
├── src/
│   ├── types.ts                    # All shared types
│   ├── daemon/
│   │   ├── server.ts               # Bun.serve entry point
│   │   ├── db.ts                   # Schema init, typed queries
│   │   ├── loop-detector.ts        # Sliding window algorithm
│   │   ├── budget.ts               # Token cap enforcement
│   │   ├── injections.ts           # Queue management
│   │   └── handlers/
│   │       ├── pre-tool.ts         # Main gate: loop + budget + inject
│   │       ├── post-tool.ts        # Token accounting
│   │       └── subagent.ts         # Agent lifecycle events
│   ├── hooks/                      # Run by Claude Code
│   │   ├── pre-tool-use.ts
│   │   ├── post-tool-use.ts
│   │   ├── subagent-start.ts
│   │   └── subagent-stop.ts
│   └── cli/
│       ├── index.ts                # Commander entry
│       ├── api.ts                  # Typed HTTP client
│       └── commands/
│           ├── inject.ts
│           ├── cap.ts
│           ├── kill.ts
│           ├── agents.ts
│           └── watch.tsx           # Ink TUI
├── install.sh
├── package.json
└── tsconfig.json
```

---

### Hook script (pre-tool-use.ts)

```typescript
// Executed by Claude Code on every PreToolUse event.
// Must exit in < 150ms. Logic lives in the daemon.

import type { PreToolUseInput, DaemonDecision } from "../types.ts";

const DAEMON = "http://localhost:47823";
const TIMEOUT_MS = 150;

const input: PreToolUseInput = JSON.parse(await Bun.stdin.text());

let decision: DaemonDecision;

try {
  const res = await fetch(`${DAEMON}/hook/pre`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  decision = await res.json();
} catch {
  // Daemon unavailable → fail open, never block Claude
  process.exit(0);
}

if (decision.block) {
  process.stderr.write(decision.reason);
  process.exit(2); // exit 2 = Claude reads reason as operator message
}

if (decision.updatedInput) {
  // Transparently modify tool arguments (e.g. redirect file paths to sandbox)
  console.log(JSON.stringify({ updatedInput: decision.updatedInput }));
}

process.exit(0);
```

---

### Daemon server (server.ts)

```typescript
import { serve } from "bun";
import { Database } from "bun:sqlite";
import { handlePreTool } from "./handlers/pre-tool.ts";
import { handlePostTool } from "./handlers/post-tool.ts";
import { handleSubagent } from "./handlers/subagent.ts";
import { initSchema, getAgents } from "./db.ts";
import type { WSData, AgentEvent } from "../types.ts";

export const db = new Database(`${process.env.HOME}/.agentctl/agents.db`, {
  create: true,
});
db.exec("PRAGMA journal_mode = WAL");
initSchema(db);

const wsClients = new Set<ServerWebSocket<WSData>>();

function broadcast(event: AgentEvent) {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) ws.send(msg);
}

serve<WSData>({
  port: 47823,

  async fetch(req, server) {
    const { pathname } = new URL(req.url);

    // Hook endpoints — called from hook scripts
    if (pathname === "/hook/pre")
      return Response.json(await handlePreTool(await req.json(), db));
    if (pathname === "/hook/post")
      return Response.json(
        await handlePostTool(await req.json(), db, broadcast),
      );
    if (pathname === "/hook/subagent-start")
      return Response.json(
        await handleSubagent("start", await req.json(), db, broadcast),
      );
    if (pathname === "/hook/subagent-stop")
      return Response.json(
        await handleSubagent("stop", await req.json(), db, broadcast),
      );

    // CLI endpoints — called from agentctl commands
    if (pathname === "/inject" && req.method === "POST")
      return Response.json(await handleInject(await req.json(), db, broadcast));
    if (pathname === "/cap" && req.method === "POST")
      return Response.json(await handleCap(await req.json(), db, broadcast));
    if (pathname === "/kill" && req.method === "POST")
      return Response.json(await handleKill(await req.json(), db, broadcast));
    if (pathname === "/agents") return Response.json(getAgents(db));

    // WebSocket — used by TUI
    if (server.upgrade(req, { data: { connectedAt: Date.now() } }))
      return undefined;

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
    },
    close(ws) {
      wsClients.delete(ws);
    },
    message() {},
  },
});

console.log("agentctl daemon listening on :47823");
```

---

### Pre-tool handler — the main gate

```typescript
// src/daemon/handlers/pre-tool.ts
import { detectLoop } from "../loop-detector.ts";
import { hashArgs } from "../util.ts";
import type { Database } from "bun:sqlite";
import type {
  PreToolUseInput,
  DaemonDecision,
  Agent,
  Injection,
} from "../../types.ts";

export async function handlePreTool(
  input: PreToolUseInput,
  db: Database,
): Promise<DaemonDecision> {
  const { session_id, tool_name, tool_input } = input;

  // 1. Token budget check
  const agent = db
    .query<Agent, string>("SELECT * FROM agents WHERE session_id = ?")
    .get(session_id);

  if (agent?.token_budget != null && agent.tokens_used >= agent.token_budget) {
    return {
      block: true,
      reason:
        `⚡ AGENTCTL: Token budget exceeded ` +
        `(${agent.tokens_used.toLocaleString()} / ${agent.token_budget.toLocaleString()} tokens). ` +
        `Summarise your work so far and stop.`,
    };
  }

  // 2. Pending injection check
  const injection = db
    .query<
      Injection,
      string
    >("SELECT * FROM injections WHERE session_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1")
    .get(session_id);

  if (injection) {
    db.run(
      "UPDATE injections SET status = 'delivered', delivered_at = ? WHERE id = ?",
      [Date.now(), injection.id],
    );
    return {
      block: true,
      reason:
        `⚡ STEERING SIGNAL from operator: ${injection.message}\n\n` +
        `Acknowledge this and adjust your current approach accordingly.`,
    };
  }

  // 3. Loop detection
  const loop = detectLoop(session_id, tool_name, tool_input, db);
  if (loop.detected) {
    return {
      block: true,
      reason:
        `⚠️ Loop detected: ${tool_name} called with identical arguments ` +
        `${loop.count}× in the last 2 minutes. Try a different approach.`,
    };
  }

  // 4. Record tool call and allow
  db.run(
    `INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at)
     VALUES (?, ?, ?, ?)`,
    [session_id, tool_name, hashArgs(tool_input), Date.now()],
  );

  return { block: false };
}
```

---

### Loop detector

```typescript
// src/daemon/loop-detector.ts
import { createHash } from "crypto";
import type { Database } from "bun:sqlite";

const WINDOW_MS = 120_000; // 2 minutes
const THRESHOLD = 5; // same call N times = loop

export function detectLoop(
  sessionId: string,
  toolName: string,
  toolInput: unknown,
  db: Database,
): { detected: boolean; count?: number } {
  const hash = createHash("sha1")
    .update(JSON.stringify(normalise(toolInput)))
    .digest("hex")
    .slice(0, 12);

  const { count } = db
    .query<{ count: number }, [string, string, string, number]>(
      `SELECT COUNT(*) as count FROM tool_calls
       WHERE session_id = ? AND tool_name = ? AND arg_hash = ? AND called_at > ?`,
    )
    .get(sessionId, toolName, hash, Date.now() - WINDOW_MS)!;

  return count >= THRESHOLD ? { detected: true, count } : { detected: false };
}

// Strip non-deterministic fields before hashing
function normalise(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([k]) => !["timestamp", "request_id", "nonce"].includes(k))
      .map(([k, v]) => [k, normalise(v)]),
  );
}
```

---

### TUI — Ink (React for terminal)

```tsx
// src/cli/commands/watch.tsx
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import type { Agent, AgentEvent } from "../../types.ts";

function TokenBar({ used, budget }: { used: number; budget?: number }) {
  if (!budget) return <Text dimColor>{used.toLocaleString()} tokens</Text>;
  const pct = Math.min(used / budget, 1);
  const filled = Math.round(pct * 16);
  const bar = "█".repeat(filled) + "░".repeat(16 - filled);
  const color = pct > 0.9 ? "red" : pct > 0.7 ? "yellow" : "green";
  return (
    <Text>
      <Text color={color}>{bar}</Text>
      <Text dimColor>
        {" "}
        {used.toLocaleString()} / {budget.toLocaleString()}
      </Text>
    </Text>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const statusColor =
    agent.status === "running"
      ? "green"
      : agent.status === "budget_exceeded"
        ? "red"
        : agent.status === "killed"
          ? "red"
          : "gray";

  const icon =
    agent.status === "running" ? "●" : agent.status === "done" ? "✓" : "✗";

  return (
    <Box flexDirection="column" marginLeft={(agent.depth ?? 0) * 3}>
      <Box gap={2}>
        <Text color={statusColor}>{icon}</Text>
        <Text bold={agent.depth === 0}>
          {agent.description ?? agent.session_id.slice(0, 8)}
        </Text>
        <TokenBar
          used={agent.tokens_used}
          budget={agent.token_budget ?? undefined}
        />
      </Box>
      {agent.current_tool && agent.status === "running" && (
        <Box marginLeft={3}>
          <Text dimColor>↳ {agent.current_tool}</Text>
        </Box>
      )}
    </Box>
  );
}

function Watch() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:47823");
    ws.onmessage = (e) => {
      const event: AgentEvent = JSON.parse(e.data);
      if (event.type === "agents_update") setAgents(event.agents);
      if (event.type === "loop_detected")
        setAlerts((prev) => [...prev.slice(-4), `⚠  ${event.message}`]);
      if (event.type === "budget_exceeded")
        setAlerts((prev) => [...prev.slice(-4), `⚡ ${event.message}`]);
    };
    return () => ws.close();
  }, []);

  useInput((input) => {
    if (input === "q") process.exit(0);
  });

  const running = agents.filter((a) => a.status === "running").length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box gap={2}>
        <Text bold>agentctl</Text>
        <Text dimColor>{running} running</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" gap={0}>
        {agents.length === 0 ? (
          <Text dimColor>no active agents — start a Claude Code session</Text>
        ) : (
          agents.map((a) => <AgentRow key={a.session_id} agent={a} />)
        )}
      </Box>

      {alerts.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {alerts.map((a, i) => (
            <Text key={i} color="yellow">
              {a}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          q to quit · agentctl inject &lt;id&gt; "msg" to steer
        </Text>
      </Box>
    </Box>
  );
}

render(<Watch />);
```

---

### Shared types

```typescript
// src/types.ts

export interface PreToolUseInput {
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface DaemonDecision {
  block: boolean;
  reason?: string; // shown to Claude when block = true
  updatedInput?: unknown; // transparently modify tool args
}

export interface Agent {
  session_id: string;
  parent_id: string | null;
  description: string | null;
  status: "running" | "done" | "killed" | "budget_exceeded";
  depth: number;
  tokens_used: number;
  token_budget: number | null;
  started_at: number;
  ended_at: number | null;
  current_tool: string | null; // populated from PostToolUse in daemon memory
}

export interface Injection {
  id: number;
  session_id: string;
  message: string;
  status: "pending" | "delivered";
  created_at: number;
  delivered_at: number | null;
}

export type AgentEvent =
  | { type: "agents_update"; agents: Agent[] }
  | { type: "loop_detected"; session_id: string; message: string }
  | { type: "budget_exceeded"; session_id: string; message: string }
  | { type: "injection_delivered"; session_id: string; message: string };
```

---

### Claude Code hook config

Installed into `~/.claude/settings.json` by `install.sh`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "~/.agentctl/bin/hooks/pre-tool-use" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.agentctl/bin/hooks/post-tool-use"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.agentctl/bin/hooks/subagent-start"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.agentctl/bin/hooks/subagent-stop"
          }
        ]
      }
    ]
  }
}
```

Hooks are compiled to standalone binaries (`bun build --compile`) so Claude Code runs them with no runtime overhead.

---

### Package config

```json
{
  "name": "agentctl",
  "version": "0.1.0",
  "scripts": {
    "dev:daemon": "bun run --watch src/daemon/server.ts",
    "build:hooks": "bun build --compile --target bun src/hooks/pre-tool-use.ts --outfile dist/hooks/pre-tool-use && ...",
    "build:daemon": "bun build --compile --target bun src/daemon/server.ts  --outfile dist/agentctl-daemon",
    "build:cli": "bun build --compile --target bun src/cli/index.ts       --outfile dist/agentctl",
    "build": "bun run build:hooks && bun run build:daemon && bun run build:cli",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12",
    "ink": "^5",
    "react": "^18"
  },
  "devDependencies": {
    "@types/react": "^18",
    "bun-types": "latest"
  }
}
```

---

## Install

Single command, like RTK:

```bash
curl -fsSL https://raw.githubusercontent.com/you/agentctl/main/install.sh | bash
```

`install.sh` does five things:

1. Detect platform (darwin-arm64, darwin-x64, linux-x64)
2. Download pre-compiled binaries from GitHub Releases into `~/.agentctl/bin/`
3. Add `~/.agentctl/bin` to PATH in `.zshrc` / `.bashrc`
4. Patch `~/.claude/settings.json` with hook entries (non-destructive merge)
5. Register daemon as a background process:
   - macOS: `launchd` plist → `~/.agentctl/agentctl-daemon.plist`
   - Linux: `systemd --user` unit
   - Fallback: pm2

After install, no configuration needed. Start Claude Code — agentctl is active.

---

## CLI reference

```bash
# List all agents (current and recent sessions)
agentctl agents

# Live TUI — agent tree with token bars, loop alerts
agentctl watch

# Inject a steering signal into a running agent
agentctl inject <session-id> "Stop using lodash, use native Array methods"
agentctl inject <session-id> "The API endpoint changed to /v2/users"

# Cap token budget for an agent
agentctl cap <session-id> --tokens 50000

# Kill one specific agent
agentctl kill <session-id>

# Show daemon status
agentctl status

# Uninstall — removes hooks from settings.json, stops daemon
agentctl uninstall
```

---

## MVP scope (2 weeks)

**Week 1 — core**

- [ ] Daemon: HTTP server, SQLite schema, WebSocket
- [ ] PreToolUse hook: loop detection + injection delivery
- [ ] PostToolUse hook: token accounting
- [ ] SubagentStart/Stop hooks: agent tree tracking
- [ ] `agentctl inject` and `agentctl cap` commands
- [ ] `agentctl agents` command (JSON output)
- [ ] `install.sh` for macOS (linux later)

**Week 2 — polish**

- [ ] TUI (`agentctl watch`) with Ink
- [ ] Token bar with colour threshold (green → yellow → red)
- [ ] Loop alerts in TUI
- [ ] `bun build --compile` for all three binaries
- [ ] launchd plist for daemon auto-start
- [ ] README with demo GIF

**Out of scope for MVP:**

- Windows support (architecture works, packaging is extra)
- Web UI (TUI is sufficient)
- Multi-machine / remote daemon
- Per-tool-type budget caps (only total token budget)
- Integration with external observability (OTel, Grafana)

---

## Risks

| Risk                                   | Likelihood                 | Mitigation                                                                                                        |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Anthropic changes hook protocol        | Low                        | Hooks are a stable, documented feature. Changes would be breaking for the whole ecosystem.                        |
| Hook timing causes Claude to fail-open | Mitigated by design        | Daemon unavailable → `exit(0)` always. agentctl never blocks Claude if it's down.                                 |
| Agent ignores injected message         | Possible                   | Message is prepended with `⚡ STEERING SIGNAL from operator:` — Claude treats operator messages with high weight. |
| Loop detector produces false positives | Possible in caches/retries | Normalise args before hashing (strip `request_id`, `timestamp`). Threshold is 5 calls, not 2.                     |
| Anthropic builds this natively         | Likely in 6-12 months      | GitHub Issues #30492 and #25408 are open but not planned. Window exists.                                          |

---

## Why this, why now

The gap is real and documented. Eight observability tools exist. Zero control tools exist. The GitHub issues naming this exact problem are open and marked as unplanned. The hook API is stable and powerful enough to implement this without any undocumented internals.

The closest prior art is RTK: a single binary, installed with one command, that sits invisibly in the tool call path and makes Claude Code meaningfully better. agentctl is the same pattern, one layer up — at the agent level instead of the shell level.

RTK author built it because they were personally losing 60-90% of tokens to verbose CLI output. agentctl is built because the same person watching five agents work in silence has no way to intervene short of destroying everything.
