# Troubleshooting

This page covers the beta recovery paths for the local install. agentctl is intentionally local and fail-open: if the daemon or hook path is broken, Claude Code should keep running, but `inject`, `cap`, `kill`, `agents`, `watch`, and `status` will not be reliable until the local install is fixed.

## `daemon: not running`

`agentctl status` prints `daemon: not running` when the CLI cannot reach the local daemon on `127.0.0.1:47823`.

Check the daemon logs first. The normal log is `~/.agentctl/daemon.log`; the error log is `~/.agentctl/daemon.error.log`.

```bash
tail -n 100 ~/.agentctl/daemon.log
tail -n 100 ~/.agentctl/daemon.error.log
```

Then restart the daemon using the registration method available on the machine:

```bash
launchctl unload ~/.agentctl/agentctl-daemon.plist 2>/dev/null || true
launchctl load -w ~/.agentctl/agentctl-daemon.plist

systemctl --user restart agentctl-daemon

pm2 restart agentctl-daemon
```

If none of launchd, `systemd --user`, or pm2 is available, start the daemon manually while debugging:

```bash
~/.agentctl/bin/agentctl-daemon
```

## Bun/PATH

Installed release binaries do not require Bun at runtime, but development commands and the installer settings patch step do require Bun on `PATH`.

For normal installed usage, make sure the CLI directory `~/.agentctl/bin` is visible:

```bash
export PATH="$HOME/.agentctl/bin:$PATH"
agentctl status
```

For local development, Bun usually needs the `~/.bun/bin` PATH entry:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun test
```

If `agentctl` is not found after install, restart the shell or source the rc file that `install.sh` updated.

## Stale DB state

Runtime state lives in `~/.agentctl/agents.db`. On daemon startup, previously `running` sessions are reconciled to `stale` because the new daemon cannot prove those agents are still active.

Use `agentctl agents` to inspect stale sessions. A stale session is historical state, not a live controllable target.

If the database appears corrupt or the local state is no longer useful, stop the daemon, move the DB aside, restart the daemon using the commands above, then check status:

```bash
mv ~/.agentctl/agents.db ~/.agentctl/agents.db.backup
agentctl status
```

Use this only for local runtime cleanup. It discards agent history, pending injections, and token counters from the active DB.

## hook config conflicts

agentctl hook entries live in `~/.claude/settings.json` and point at binaries under `~/.agentctl/bin/hooks/`.

If hooks stop firing, inspect the configured commands:

```bash
cat ~/.claude/settings.json
ls -l ~/.agentctl/bin/hooks/
```

Re-running `install.sh` repairs stale agentctl hook commands while preserving unrelated hooks. It removes old agentctl-managed hook paths that include `/.agentctl/bin/hooks/` and installs the current canonical commands.

If the hook config is badly tangled, use `agentctl uninstall` to remove only agentctl-managed hooks and local files, then run the installer again. Keep unrelated hook entries only if you still need them.
