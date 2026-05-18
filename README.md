# agentctl

> Sub-agent control plane for Claude Code.  
> See what agents do. Steer them mid-run. Stop runaway loops.

---

## The problem

When Claude Code runs sub-agents, you have two options: watch a one-line terminal entry with no detail, or kill everything with `Ctrl+C` and lose all context. There is no middle ground.

```
MONITORING  →  ✅ Solved (893⭐ repos, native Channels from Anthropic)
CONTROL     →  ❌ Unsolved — agentctl lives here
```

## What it does

**Three capabilities, no more:**

```bash
# Inject a steering signal into a running agent
agentctl inject <agent-id> "Stop building auth. Use Supabase Auth instead."

# Cap an agent's approximate token budget
agentctl cap <agent-id> --tokens 50000

# Stop one agent at its next tool call boundary
agentctl stop-next-tool-call <agent-id>
```

## Demo

![agentctl demo](docs/demo.gif)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash
```

By default, the installer downloads the `latest` assets from `https://github.com/IliasAlmerekov/agentctl/releases`. Set `AGENTCTL_VERSION` to pin a release tag:

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | AGENTCTL_VERSION=v0.2.0 bash
```

For the detected platform, the release must include `SHA256SUMS` plus `agentctl-$platform.tar.gz`. That archive contains the CLI, daemon, and hook binaries. The installer verifies `SHA256SUMS` before extracting or installing downloaded binaries. This protects against download corruption and HTTPS MitM, but not against a compromised release origin — if the GitHub release itself were tampered with, both the binary and the checksum file would be replaced together. Stronger supply-chain guarantees (cosign/Sigstore attestation) are out of scope for v0.2.

It installs CLI and daemon binaries to `~/.agentctl/bin/`, hook binaries to `~/.agentctl/bin/hooks/`, generates or reuses `~/.agentctl/auth-token`, patches `~/.claude/settings.json`, then registers the daemon with launchd, `systemd --user`, or pm2 when available. After install, restart your shell or reload your rc file, then run `agentctl status`.

Supported and unsupported platforms are listed in `docs/platforms.md`.
Step-by-step first-run onboarding is in `docs/onboarding.md`.
Troubleshooting for daemon, PATH, stale DB, and hook config problems is in `docs/troubleshooting.md`.
MVP out-of-scope items are listed in `docs/out-of-scope.md`.
Launch release notes are in `docs/release-notes.md`, and changes are tracked in `CHANGELOG.md`.

## Beta status

agentctl is in the `0.2.0` public beta line. The public install path is the
`main` branch installer plus GitHub Release archives, and the release smoke
workflow verifies that path before a release is published.

The supported beta release platforms are macOS Apple Silicon, macOS Intel, and
Linux x64. Windows and Linux arm64 are not supported. See `docs/platforms.md`
for the full platform matrix and unsupported cases.

## Usage

Implemented commands:

```bash
agentctl agents          # List all agents with token usage
agentctl watch           # Live TUI — agent tree, token bars, loop alerts
agentctl status          # Show daemon status
agentctl inject <id> "message"
agentctl cap <id> --tokens 50000
agentctl stop-next-tool-call <id>
agentctl kill <id>      # Legacy alias for stop-next-tool-call
agentctl uninstall       # Remove hooks, daemon registration, and local files
```

Unknown session IDs are reported as `not_found`: `inject`, `cap`,
`stop-next-tool-call`, and `kill` print an error and exit non-zero instead of
pretending that a mistyped agent ID was controlled.

`cap` enforces an approximate token budget. agentctl uses hook-reported `tokens_used` when Claude Code provides it; when that field is unavailable, it falls back to a rough JSON-size estimate for tool input and response payloads.

`stop-next-tool-call` does not interrupt a tool that is already running. It marks
the agent so its next tool call is blocked by `PreToolUse`; the legacy `kill`
command is kept as an alias for the same hook-boundary behavior.

## How it works

Claude Code runs a hook script on every tool call. The hook calls the local daemon (`127.0.0.1:47823`) which decides whether to block, inject a message, or allow. The daemon tracks:

- **Loop detection** — same tool + same args called 5× in 2 minutes → blocked
- **Budget enforcement** — approximate tokens_used ≥ token_budget → blocked with summary request
- **Injection queue** — pending steering signals delivered at the next tool call boundary

If the daemon is unreachable, hooks exit `0` — Claude is never blocked by agentctl being down.

The exact `exit(2)` blocking contract and limitations are documented in `docs/hook-contract.md`.

## Local security model

agentctl is a single-user local control plane. The daemon binds only to IPv4 loopback (`127.0.0.1:47823`) and requires the local token from `~/.agentctl/auth-token` for CLI, TUI WebSocket, and hook requests.

This protects against unauthenticated local HTTP clients accidentally or opportunistically controlling agents through the daemon port. It does not protect against code already running as your user that can read files under your home directory, replace agentctl binaries, or edit Claude Code hook settings.

A short security note is available in `docs/security.md`.

## Architecture

```
Claude Code (agent + sub-agents)
         │ tool calls
         ▼
   Hook scripts (.ts)          ← <250ms p95 per call
         │ HTTP POST 127.0.0.1:47823
         ▼
   agentctl daemon (Bun)
   ├── SQLite: agents.db
   ├── Loop detector
   ├── Budget manager
   ├── Injection queue
   └── WebSocket → TUI
```

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev:daemon      # daemon with hot reload
bun run typecheck       # type check
bun run build           # compile all binaries to dist/
```

## Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Runtime | Bun | Compiled single-file binaries; hook latency is gated by `measure:hooks` |
| Database | bun:sqlite | Native, WAL mode, no bindings |
| TUI | Ink (React for terminal) | Declarative, composable |
| CLI parser | commander | Lightweight, well-typed |
| Distribution | bun build --compile + tar.gz | Compiled binaries in one archive per platform, no runtime required |
