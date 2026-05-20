# Getting started with agentctl

## 1. Install

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash
```

Pin a specific version with `AGENTCTL_VERSION`:

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | AGENTCTL_VERSION=v0.2.0 bash
```

The installer downloads the binary archive for your platform
(`agentctl-darwin-arm64.tar.gz`, `agentctl-darwin-x64.tar.gz`, or
`agentctl-linux-x64.tar.gz`), verifies `SHA256SUMS`, and installs:

- CLI + daemon → `~/.agentctl/bin/`
- Hook scripts → `~/.agentctl/bin/hooks/`
- Auth token → `~/.agentctl/auth-token` (generated if missing)
- Hook config → patched into `~/.claude/settings.json`
- Daemon process → registered with launchd / `systemd --user` / pm2

Restart your shell (or `source ~/.zshrc`), then verify:

```bash
agentctl status
# daemon: ok  running: 0  total: 0
```

---

## 2. Open the dashboard

```bash
agentctl
```

The TUI opens. Start a Claude Code session in another terminal — the agent card
appears within a second of its first tool call.

---

## 3. Navigate and act

| Key | Action |
|-----|--------|
| `↑↓←→` | Move between agent cards |
| `i` | Inject a message into the selected agent |
| `k` | Stop the selected agent at its next tool call |
| `c` | Set a token cap (agent stops when it reaches the limit) |
| `q` | Quit |

---

## 4. CLI commands

Everything also works without the TUI, using session IDs from `agentctl agents`:

```bash
agentctl agents                         # list all sessions
agentctl watch                          # open the TUI
agentctl inject <session-id> "message"
agentctl cap <session-id> --tokens 50000
agentctl stop-next-tool-call <session-id>
agentctl uninstall
```

---

## How hooks work

The installer adds four hook entries to `~/.claude/settings.json` pointing at:

- `~/.agentctl/bin/hooks/pre-tool-use`
- `~/.agentctl/bin/hooks/post-tool-use`
- `~/.agentctl/bin/hooks/subagent-start`
- `~/.agentctl/bin/hooks/subagent-stop`

These run on every Claude Code tool call and report to the local daemon. The
`install-hooks` command is an internal installer command used by `install.sh`
— it is not part of the normal user command reference.

Hooks are designed to fail open: if the daemon is unavailable, the auth token
is missing, or input cannot be parsed, Claude Code continues normally. The
exact blocking contract is in [`docs/hook-contract.md`](hook-contract.md).

---

## Recovery map

| Problem | Fix |
|---------|-----|
| Missing or empty auth token | Re-run the installer — it recreates `~/.agentctl/auth-token` |
| Port conflict on 47823 | Stop any existing `agentctl-daemon`, then restart |
| Daemon unavailable | Check logs at `~/.agentctl/daemon.log`, restart via launchd / systemd / pm2 |
| Stale DB state | Run `agentctl agents` to inspect; move `agents.db` aside to reset |
| PATH issues | Add `~/.agentctl/bin` to your shell PATH |
| Hook config conflicts | Re-run installer to repair; or `agentctl uninstall` then reinstall |

Full recovery details: [`docs/troubleshooting.md`](troubleshooting.md)

---

## Known limitations

- no Windows
- no Linux arm64
- no remote daemon (local only)
- no Web UI
- not a sandbox — does not protect against code running as the same user
- hooks fail open when agentctl is unavailable

Full platform matrix: [`docs/platforms.md`](platforms.md) ·
Security model: [`docs/security.md`](security.md) ·
Out of scope: [`docs/out-of-scope.md`](out-of-scope.md)
