# agentctl

Your Claude Code agents are running. Do you know what they're doing?

---

When Claude Code spawns sub-agents, you get a one-line terminal entry and zero
control. When something goes wrong — a loop, a bad direction, a token blowout —
your only option is `Ctrl+C`. Every agent dies. All context is lost.

**agentctl solves this.** One command gives you a live dashboard of every
session. You can redirect any agent mid-run, cap its token spend, or stop just
that one — without touching the others.

```
╭─ agentctl ──────────────────────────────╮  ╭─ myapp ─────────────────────────────────╮
│ ● running                      running  │  │ ● running                      running  │
│ ~/Projects/agentctl                     │  │ ~/Projects/myapp                        │
│ ↳ Edit src/daemon/budget.ts             │  │ ↳ Bash                                  │
│                                         │  │                                         │
│ Context ████████████░░░░░░░░  90k/200k  │  │ Context ██████░░░░░░░░░░░░░░  55k/200k  │
│                                         │  │                                         │
│ 4m 32s                                  │  │ 12m 01s                                 │
╰─────────────────────────────────────────╯  ╰─────────────────────────────────────────╯

↑↓←→ navigate   i inject   k kill   c cap   q quit
```

> 📽 A full demo GIF lives at [`docs/demo.gif`](docs/demo.gif).

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash
```

Pin a specific version with `AGENTCTL_VERSION`:

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | AGENTCTL_VERSION=v0.2.0 bash
```

The installer downloads a release archive from
`https://github.com/IliasAlmerekov/agentctl/releases`, verifies `SHA256SUMS`,
installs CLI + daemon to `~/.agentctl/bin/` and hooks to
`~/.agentctl/bin/hooks/`, generates `~/.agentctl/auth-token`, patches
`~/.claude/settings.json`, and registers the daemon with launchd,
`systemd --user`, or pm2.

Then:

```bash
agentctl
```

Done. The daemon starts automatically. Your sessions appear within a second of
making a tool call.

---

## What you get

Each card in the dashboard shows:

- **Project name** — `agentctl` or `myapp`, not `session:b12e003c`
- **Status** — `● running`, `✓ done`, `✗ killed`, `⚡ budget exceeded`
- **Current tool** — what the agent is doing right now (`↳ Edit`, `↳ Bash`)
- **Working directory** — so you know which terminal it came from
- **Context bar** — how much of the 200k context window is used
- **Budget bar** — if you set a cap, how close it is to the limit
- **Duration** — how long it has been running

---

## Controls

Everything from the TUI — no need to copy session IDs:

| Key | What happens |
|-----|-------------|
| `↑↓←→` | Move between agent cards |
| `i` | Type a message → agent reads it at its next tool call |
| `k` | Stop agent at its next tool call boundary |
| `c` | Set a token cap — agent stops when it hits the limit |
| `q` | Quit the dashboard |

**Redirect an agent mid-run:**
```
Press i → "Stop building auth. Use Supabase Auth instead." → Enter
```
The agent reads your message at its next tool call and adjusts. No restart,
no context loss, other agents keep running.

**Prevent a token blowout:**
```
Press c → 50000 → Enter
```
When the agent hits 50k tokens it receives: _"Budget exceeded. Summarise your
work and stop."_

---

## CLI commands

For scripting or when you don't need the TUI:

```bash
agentctl                              # Open the live dashboard (default)
agentctl watch                        # Same, explicit
agentctl agents                       # List all agents as text
agentctl status                       # Daemon health check
agentctl inject <id> "message"        # Inject from CLI
agentctl cap <id> --tokens 50000      # Set token cap from CLI
agentctl stop-next-tool-call <id>     # Stop at next tool call boundary
agentctl kill <id>                    # Alias for stop-next-tool-call
agentctl uninstall                    # Remove everything
```

`stop-next-tool-call` does not interrupt a tool that is already running. It
marks the agent so its next tool call is blocked. Unknown session IDs are reported as `not_found` — `inject`, `cap`,
`stop-next-tool-call`, and `kill` exit non-zero rather than silently doing nothing.

`cap` enforces an approximate token budget. agentctl uses hook-reported `tokens_used` when Claude Code provides it; when that field is unavailable, it
falls back to a rough JSON-size estimate for tool input and response payloads.

---

## How it works

```
Claude Code (agents + sub-agents)
        │ every tool call triggers a hook  (<250ms p95 overhead)
        ▼
  Hook scripts  (5ms typical, fail-open)
        │ HTTP POST  127.0.0.1:47823
        ▼
  agentctl daemon  (Bun, SQLite)
  ├── Loop detector   — same tool + same args 5× in 2 min → blocked
  ├── Budget enforcer — tokens_used ≥ token_budget → blocked
  ├── Injection queue — your message delivered at next tool call
  └── WebSocket broadcast → TUI (live updates, <1s latency)
```

If the daemon is unreachable, hooks exit `0` — Claude is never blocked by
agentctl being down. The hook contract is in [`docs/hook-contract.md`](docs/hook-contract.md).

---

## Security

agentctl is a **single-user local control plane**. The daemon binds only to
`127.0.0.1:47823` and requires the auth token from `~/.agentctl/auth-token`
for every request — CLI, TUI WebSocket, and hooks alike.

This protects against unauthenticated local clients. It does not protect
against code running as the same user. See [`docs/security.md`](docs/security.md).

---

## Platforms

| Platform | Supported |
|----------|-----------|
| macOS Apple Silicon | ✅ |
| macOS Intel | ✅ |
| Linux x64 | ✅ |
| Windows | ❌ |
| Linux arm64 | ❌ |

---

## Beta

`0.2.0` public beta. Install path: `main` branch installer + GitHub Release
archives for macOS and Linux x64. Windows and Linux arm64 are not supported.

Changes: [`CHANGELOG.md`](CHANGELOG.md) · Release notes: [`docs/release-notes.md`](docs/release-notes.md) ·
Onboarding: [`docs/onboarding.md`](docs/onboarding.md) ·
Troubleshooting: [`docs/troubleshooting.md`](docs/troubleshooting.md) ·
Out of scope: [`docs/out-of-scope.md`](docs/out-of-scope.md) ·
Platforms: [`docs/platforms.md`](docs/platforms.md)

---

## Development

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
bun install && bun test && bun run typecheck
bun run build:local   # → dist/agentctl  dist/agentctl-daemon  dist/hooks/
```

Copy to your local install after building:

```bash
cp dist/agentctl ~/.agentctl/bin/agentctl
cp dist/agentctl-daemon ~/.agentctl/bin/agentctl-daemon
```
