# Troubleshooting

agentctl is fail-open — if the daemon or hooks break, Claude Code keeps running.
Controls (`inject`, `cap`, `stop-next-tool-call`, `kill`) and the TUI won't
work until the install is fixed.

---

## Dashboard shows "No active agents"

Sessions are hidden after 4 hours of inactivity. If you have an active Claude
Code session not appearing:

1. `agentctl status` — confirm the daemon is running
2. Check hooks are installed: `cat ~/.claude/settings.json | grep agentctl`
3. Make a tool call in your Claude session — this triggers the hook and
   registers the session. It appears within a second.

If the daemon restarted while a session was active, that session becomes
`stale`. The next tool call re-activates it automatically.

---

## `daemon: not running`

`agentctl status` returns `daemon: not running` when it can't reach
`127.0.0.1:47823`.

Check the logs at `~/.agentctl/daemon.log` and `~/.agentctl/daemon.error.log`:

```bash
tail -50 ~/.agentctl/daemon.log
tail -50 ~/.agentctl/daemon.error.log
```

Restart the daemon (use `systemd --user` on Linux, launchd on macOS, pm2 elsewhere):

```bash
# macOS (launchd)
launchctl unload ~/.agentctl/agentctl-daemon.plist 2>/dev/null || true
launchctl load -w ~/.agentctl/agentctl-daemon.plist

# Linux (systemd)
systemctl --user restart agentctl-daemon

# pm2
pm2 restart agentctl-daemon

# Manual
~/.agentctl/bin/agentctl-daemon &
```

---

## Port conflict

If the log says `agentctl daemon cannot start: 127.0.0.1:47823 is already in use`,
stop the existing `agentctl-daemon` process and restart.

---

## Missing auth token

If the log says `agentctl daemon cannot start: missing auth token`, re-run the
installer — it recreates `~/.agentctl/auth-token` with the right permissions.

---

## Bun/PATH

Installed release binaries and `install.sh` do not require Bun. The installer
downloads compiled binaries and verifies checksums.

Make sure `~/.agentctl/bin` is on your PATH:

```bash
export PATH="$HOME/.agentctl/bin:$PATH"
agentctl status
```

For local development, also add `~/.bun/bin`:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun test
```

---

## Upgrade / reinstall

Re-running the installer is the supported upgrade path. It downloads the new
archive, verifies `SHA256SUMS`, replaces binaries, and repairs hook entries.
The reinstall preserves `~/.agentctl/auth-token` and does not duplicate hook entries when run more than once.

---

## Stale DB

Session history lives in `~/.agentctl/agents.db`. To reset:

```bash
mv ~/.agentctl/agents.db ~/.agentctl/agents.db.backup
agentctl status   # daemon creates a fresh DB on next start
```

---

## hook config conflicts

If hooks stop firing, check that `~/.claude/settings.json` still contains the
agentctl entries and that the hook binaries are present:

```bash
cat ~/.claude/settings.json        # check agentctl entries are present
ls -l ~/.agentctl/bin/hooks/       # check binaries exist
```

Re-run the installer to repair stale hook paths without touching unrelated hooks.
For a clean reset: `agentctl uninstall`, then reinstall.

---

## Control command says `not found`

`inject`, `cap`, `stop-next-tool-call`, or `kill` prints `not found` when the
daemon has no record of that session ID. Run `agentctl agents` to get the
current list and copy the ID from there.
