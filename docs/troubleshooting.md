# Troubleshooting

This page covers the beta recovery paths for the local install. agentctl is intentionally local and fail-open: if the daemon or hook path is broken, Claude Code should keep running, but `inject`, `cap`, `stop-next-tool-call`, `kill`, `agents`, `watch`, and `status` will not be reliable until the local install is fixed.

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

## Port conflict

If the daemon log says `agentctl daemon cannot start: 127.0.0.1:47823 is already in use`, another process already owns the agentctl port. Stop any existing `agentctl-daemon` process or free that port, then restart through launchd, `systemd --user`, or pm2.

If the auth token is missing or empty, the daemon log prints an `agentctl daemon cannot start` message that points at `~/.agentctl/auth-token`. Re-running the installer recreates a missing token and resets permissions on an existing one.

## Bun/PATH

Installed release binaries and `install.sh` do not require Bun. The installer downloads compiled binaries, verifies checksums, and uses the compiled `agentctl` CLI to patch Claude settings.

For normal installed usage, make sure the CLI directory `~/.agentctl/bin` is visible:

```bash
export PATH="$HOME/.agentctl/bin:$PATH"
agentctl status
```

For local development only, Bun usually needs the `~/.bun/bin` PATH entry:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun test
```

If `agentctl` is not found after install, restart the shell or source the rc file that `install.sh` updated.

## Upgrade / reinstall

Re-running the installer is the supported upgrade path for the beta. It downloads the selected release archive again, verifies `SHA256SUMS`, replaces the installed CLI, daemon, and hook binaries, then patches Claude settings back to the current hook paths.

The reinstall path preserves `~/.agentctl/auth-token`, so existing local CLI, TUI, and hook authentication keep using the same token. It also repairs stale agentctl hook commands and does not duplicate hook entries when the installer is run more than once. Unrelated hook entries in `~/.claude/settings.json` are preserved.

If a daemon registration already exists, the installer rewrites the launchd plist, `systemd --user` service, or pm2 entry for the current `~/.agentctl/bin/agentctl-daemon` path.

## Stale DB state

Runtime state lives in `~/.agentctl/agents.db`. On daemon startup, previously `running` sessions are reconciled to `stale` because the new daemon cannot prove those agents are still active.

Use `agentctl agents` to inspect stale sessions. A stale session is historical state, not a live controllable target.

If the database appears corrupt or the local state is no longer useful, stop the daemon, move the DB aside, restart the daemon using the commands above, then check status:

```bash
mv ~/.agentctl/agents.db ~/.agentctl/agents.db.backup
agentctl status
```

Use this only for local runtime cleanup. It discards agent history, pending injections, and token counters from the active DB.

For full recovery instructions covering `agents.db-wal`, `agents.db-shm`, schema version policy, and the daemon failure model, see `docs/storage.md`.

## Control command says `not found`

If `inject`, `cap`, `stop-next-tool-call`, or `kill` prints `not found`, the daemon has no live or historical record for that session ID. Re-run `agentctl agents` and copy the session ID from the current list. For stale sessions, start a fresh Claude Code run; agentctl does not queue future injections for unknown IDs.

## hook config conflicts

agentctl hook entries live in `~/.claude/settings.json` and point at binaries under `~/.agentctl/bin/hooks/`.

If hooks stop firing, inspect the configured commands:

```bash
cat ~/.claude/settings.json
ls -l ~/.agentctl/bin/hooks/
```

Re-running `install.sh` repairs stale agentctl hook commands while preserving unrelated hooks. It removes old agentctl-managed hook paths that include `/.agentctl/bin/hooks/` and installs the current canonical commands.

If the hook config is badly tangled, use `agentctl uninstall` to remove only agentctl-managed hooks and local files, then run the installer again. Keep unrelated hook entries only if you still need them.
