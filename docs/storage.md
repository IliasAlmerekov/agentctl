# Storage

agentctl stores all runtime state locally in `~/.agentctl/`.

## Files

- `~/.agentctl/agents.db` — SQLite database. Tracks agent sessions, tool calls, pending injections, daemon boot history.
- `~/.agentctl/agents.db-wal` — SQLite write-ahead log. Created automatically when WAL mode is active.
- `~/.agentctl/agents.db-shm` — SQLite shared memory file for WAL coordination.
- `~/.agentctl/auth-token` — local auth token used by CLI, TUI, and hooks to authenticate to the daemon.

All four files belong to the same single-daemon control plane. Move them aside or delete them as a group when recovering from corruption.

## Schema version

agentctl `0.2.0` supports schema version 1 only. The daemon records the version in the `schema_metadata` table on first start.

If the database contains a different schema version, the daemon refuses to start with an actionable error like:

```
agentctl daemon cannot start: unsupported schema version N. This binary supports schema version 1. Upgrade the daemon binary or move ~/.agentctl/agents.db aside.
```

If the `schema_metadata` table exists but the `schema_version` row is missing or malformed, the daemon also refuses to start:

```
agentctl daemon cannot start: schema_metadata exists but schema_version is missing or unreadable. Move ~/.agentctl/agents.db aside to recover.
```

This is fail-closed: a database whose compatibility cannot be established is never silently re-stamped as v1. The only path to a fresh v1 database is when no `schema_metadata` table exists at all (truly empty install).

This protects user data from accidental schema downgrade or from a future-version daemon writing to an older database.

## WAL mode

The daemon enables `PRAGMA journal_mode = WAL` at startup. WAL has two benefits for a single-process daemon:

- Reads are not blocked by writes.
- Crash recovery is automatic on next open.

WAL files (`-wal`, `-shm`) are normal and expected to exist alongside `agents.db`.

## Concurrency model

agentctl is a single-user, single-daemon, single-connection control plane. The daemon process owns the only writer connection to `agents.db`. Hooks, CLI, and TUI never open the database directly — they go through the daemon over `127.0.0.1:47823`.

Because Bun executes JavaScript on a single event loop and `bun:sqlite` operates synchronously, all daemon database operations are serialized in the order they arrive. There are no external writers to coordinate with, and no transaction wrapping is required across handler statements: each handler code path performs at most one write, which is atomic by SQLite single-statement guarantees.

## Stale reconciliation

On startup, the daemon marks any `running` agent in the database as `stale`. The new daemon cannot prove old sessions are still active. Stale agents appear in `agentctl agents` output as historical records, not as live controllable targets.

## Retention

Old data is cleaned up at every daemon startup:

- `tool_calls` older than 7 days are deleted.
- Delivered `injections` older than 7 days are deleted.

Pending injections, agent records, and daemon boot history are preserved indefinitely.

## Recovery

If the database appears corrupt or inconsistent:

1. Stop the daemon (kill the process or restart its service).
2. Move the database files aside:

   ```bash
   mv ~/.agentctl/agents.db ~/.agentctl/agents.db.backup
   mv ~/.agentctl/agents.db-wal ~/.agentctl/agents.db-wal.backup 2>/dev/null || true
   mv ~/.agentctl/agents.db-shm ~/.agentctl/agents.db-shm.backup 2>/dev/null || true
   ```

3. Restart the daemon. It creates a fresh database with `schema_version = 1`.

This discards agent history, pending injections, and token counters. The auth token (`~/.agentctl/auth-token`) is preserved.

## Failure model

- **Hooks (pre/post tool, subagent start/stop):** fail-open. If the daemon is unreachable or returns an error, hooks exit `0` and Claude Code is never blocked by agentctl being down.
- **CLI commands (`inject`, `cap`, `stop-next-tool-call`, `kill`, `agents`, `status`, `watch`):** fail-closed. If the daemon returns an error or is unreachable, the CLI prints the error to stderr and exits non-zero. Run `agentctl status` first to verify the daemon is reachable.
