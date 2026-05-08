# Data Integrity And Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зафиксировать storage guarantees для `~/.agentctl/agents.db`: schema v1 enforcement, recovery procedure, retention behavior, single-daemon concurrency model.

**Architecture:** Один code change (schema version guard), несколько новых тестов (mismatch, recovery, scale), новый документ `docs/storage.md` объединяющий всё в одном месте.

**Tech Stack:** Bun, bun:sqlite, bun:test

---

## Decisions (recorded)

- **Forward compat policy:** v1.0.0 поддерживает только schema v1. Если найдена другая версия — daemon отказывается стартовать с actionable error. Future migrations будут реализованы позже.
- **DB failure policy:** hooks fail-open (existing behavior); CLI fails-closed с `process.exit(1)` и понятным сообщением (existing behavior через catch блоки `cmdInject`/`cmdCap`/`cmdKill`).
- **Concurrency model:** один daemon process = одна SQLite connection = нет внешних writers. Все handlers выполняются последовательно в Bun event loop. Atomic guarantees provided by single-statement writes.

## Code observations (verified)

- `handlePreTool`: пути взаимоисключающие — либо `markDelivered` (injection), либо INSERT tool_calls (no injection). Нет multi-write пути → transaction не нужен.
- `handlePostTool`: один UPDATE через `addTokens`. Чтение `getAgent` после — read-after-write в same tick.
- `handleSubagent`: один INSERT/UPDATE per call.
- `cleanupOldRuntimeData`: два DELETE без транзакции. Если процесс упадёт между ними, останется частичный cleanup — данные не теряются, просто будут удалены при следующем рестарте. Acceptable.

## File Map

| Action | File | Что делает |
|--------|------|-----------|
| Modify | `src/daemon/db.ts` | `assertSupportedSchema()` экспорт; вызов в `prepareDaemonDatabase` |
| Modify | `src/daemon/startup.ts` | `formatDaemonStartupError` обрабатывает schema mismatch |
| Modify | `src/daemon/db.test.ts` | Тесты на schema mismatch + retention scale + recovery |
| Modify | `src/daemon/startup.test.ts` | Тест что schema mismatch выдаёт actionable error |
| Create | `docs/storage.md` | Storage docs: schema v1, WAL, retention, recovery, concurrency, failure model |
| Modify | `docs/troubleshooting.md` | Ссылка на `docs/storage.md` для recovery |
| Modify | `ROADMAP.md` | Phase 03 → Done |
| Modify | `docs/roadmap/03-data-integrity-and-storage.md` | Work items checked off |

---

## Task 1: Schema version mismatch refuses daemon startup

**Files:**
- Modify: `src/daemon/db.ts`
- Modify: `src/daemon/db.test.ts`

- [ ] **Step 1: Write failing test**

Добавить в `src/daemon/db.test.ts` после существующего `describe("database schema metadata", ...)`:

```typescript
import { assertSupportedSchema } from "./db.ts";

describe("schema version guard", () => {
  test("accepts a database with the supported schema version", () => {
    const db = createTestDb();
    expect(() => assertSupportedSchema(db)).not.toThrow();
  });

  test("accepts a database with no schema_metadata row (fresh install)", () => {
    const db = new Database(":memory:");
    expect(() => assertSupportedSchema(db)).not.toThrow();
  });

  test("rejects a database with an unsupported future schema version", () => {
    const db = createTestDb();
    db.run(
      `UPDATE schema_metadata SET value = ? WHERE key = 'schema_version'`,
      [String(CURRENT_SCHEMA_VERSION + 1)],
    );
    expect(() => assertSupportedSchema(db)).toThrow(
      `agentctl daemon does not support schema version ${CURRENT_SCHEMA_VERSION + 1}. This binary supports schema version ${CURRENT_SCHEMA_VERSION}. Upgrade the daemon binary or move ~/.agentctl/agents.db aside.`,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
~/.bun/bin/bun test src/daemon/db.test.ts
```

Ожидается: FAIL — `assertSupportedSchema is not a function`

- [ ] **Step 3: Implement `assertSupportedSchema` and call in `prepareDaemonDatabase`**

В `src/daemon/db.ts` после функции `getSchemaVersion`:

```typescript
export function assertSupportedSchema(db: Database): void {
  const tableExists = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_metadata'",
    )
    .get();
  if (!tableExists) return;

  const version = getSchemaVersion(db);
  if (version === null) return;
  if (version === CURRENT_SCHEMA_VERSION) return;

  throw new Error(
    `agentctl daemon does not support schema version ${version}. ` +
    `This binary supports schema version ${CURRENT_SCHEMA_VERSION}. ` +
    `Upgrade the daemon binary or move ~/.agentctl/agents.db aside.`,
  );
}
```

Изменить `prepareDaemonDatabase` чтобы вызвать guard ДО `initSchema`:

```typescript
export function prepareDaemonDatabase(
  db: Database,
  options: PrepareDaemonDatabaseOptions = {},
): DaemonBoot {
  const now = options.now ?? Date.now();

  assertSupportedSchema(db);
  initSchema(db);
  reconcileRunningAgents(db, now);
  cleanupOldRuntimeData(db, now, options.retentionMs);
  return startDaemonRuntime(db, options.bootId, now);
}
```

- [ ] **Step 4: Run tests**

```bash
~/.bun/bin/bun test src/daemon/db.test.ts
```

Ожидается: все pass

- [ ] **Step 5: Commit**

```bash
git add src/daemon/db.ts src/daemon/db.test.ts
git commit -m "feat: refuse daemon startup on unsupported schema version"
```

---

## Task 2: Schema mismatch produces actionable startup error

**Files:**
- Modify: `src/daemon/startup.ts`
- Modify: `src/daemon/startup.test.ts`

- [ ] **Step 1: Write failing test**

В `src/daemon/startup.test.ts` после существующих тестов добавить:

```typescript
test("reports a clear recovery path when the schema is from a newer daemon", () => {
  const home = tempHome();
  mkdirSync(join(home, ".agentctl"), { recursive: true });
  writeFileSync(join(home, ".agentctl", "auth-token"), "token\n");

  // Pre-populate DB with future schema version
  const dbPath = join(home, ".agentctl", "agents.db");
  const seed = new Database(dbPath, { create: true });
  seed.exec(`
    CREATE TABLE schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  seed.run(
    "INSERT INTO schema_metadata (key, value, updated_at) VALUES ('schema_version', '999', 0)",
  );
  seed.close();

  expect(() =>
    startDaemon({
      home,
      serve: ((opts: { hostname: string; port: number }) => ({
        stop() {},
        port: opts.port,
        hostname: opts.hostname,
      })) as unknown as typeof Bun.serve,
      setIntervalFn: ((..._args: unknown[]) => 0) as unknown as typeof setInterval,
      logger: { log: () => {} },
    }),
  ).toThrow(/schema version 999.*supports schema version 1.*move .* aside/s);
});
```

Add `Database` import at top of test file if missing:
```typescript
import { Database } from "bun:sqlite";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
~/.bun/bin/bun test src/daemon/startup.test.ts
```

Ожидается: FAIL — error пробрасывается без оборачивания в "agentctl daemon cannot start" prefix

- [ ] **Step 3: Update `formatDaemonStartupError`**

В `src/daemon/startup.ts` добавить проверку schema mismatch перед общим fallback:

```typescript
function isSchemaMismatchError(error: unknown): boolean {
  return errorMessage(error).includes("does not support schema version");
}
```

И в `formatDaemonStartupError` перед последним `return`:

```typescript
  if (isSchemaMismatchError(error)) {
    return error instanceof Error ? error : new Error(errorMessage(error));
  }
```

(Schema error message уже actionable; не нужно его оборачивать в "agentctl daemon cannot start" prefix.)

- [ ] **Step 4: Run tests**

```bash
~/.bun/bin/bun test src/daemon/startup.test.ts
```

Ожидается: все pass

- [ ] **Step 5: Commit**

```bash
git add src/daemon/startup.ts src/daemon/startup.test.ts
git commit -m "feat: surface schema mismatch as actionable daemon startup error"
```

---

## Task 3: Retention cleanup at scale

**Files:**
- Modify: `src/daemon/db.test.ts`

- [ ] **Step 1: Write failing test**

Добавить в `src/daemon/db.test.ts`:

```typescript
describe("retention cleanup at scale", () => {
  test("removes old tool_calls and delivered injections from a large dataset", () => {
    const db = createTestDb();
    const now = 1_000_000;
    const old = now - 30 * 24 * 60 * 60 * 1_000; // 30 days old
    const fresh = now - 60 * 1_000; // 1 minute old

    db.exec("BEGIN TRANSACTION");
    for (let i = 0; i < 10_000; i++) {
      db.run(
        "INSERT INTO tool_calls (session_id, tool_name, arg_hash, called_at) VALUES (?, ?, ?, ?)",
        [`session-${i}`, "Bash", `hash-${i}`, i % 2 === 0 ? old : fresh],
      );
    }
    for (let i = 0; i < 1_000; i++) {
      db.run(
        "INSERT INTO injections (session_id, message, status, created_at, delivered_at) VALUES (?, ?, 'delivered', ?, ?)",
        [`session-${i}`, `msg-${i}`, old, old],
      );
    }
    db.exec("COMMIT");

    cleanupOldRuntimeData(db, now);

    const remainingToolCalls = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM tool_calls")
      .get();
    expect(remainingToolCalls?.count).toBe(5_000);

    const remainingInjections = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM injections")
      .get();
    expect(remainingInjections?.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (existing logic should handle it)**

```bash
~/.bun/bin/bun test src/daemon/db.test.ts
```

Ожидается: PASS — это verification test for existing behavior. Если упадёт — issue в `cleanupOldRuntimeData`.

(Note: this is unusual for TDD — the test verifies existing implementation handles scale. If it passes immediately, that's evidence; we don't need to change implementation.)

- [ ] **Step 3: Commit**

```bash
git add src/daemon/db.test.ts
git commit -m "test: verify retention cleanup handles 10k+ rows"
```

---

## Task 4: Daemon recovers from missing/aside-moved database

**Files:**
- Modify: `src/daemon/startup.test.ts`

- [ ] **Step 1: Write failing test**

В `src/daemon/startup.test.ts` добавить:

```typescript
test("creates a fresh database when one does not exist", () => {
  const home = tempHome();
  mkdirSync(join(home, ".agentctl"), { recursive: true });
  writeFileSync(join(home, ".agentctl", "auth-token"), "token\n");

  const runtime = startDaemon({
    home,
    serve: ((opts: { hostname: string; port: number }) => ({
      stop() {},
      port: opts.port,
      hostname: opts.hostname,
    })) as unknown as typeof Bun.serve,
    setIntervalFn: ((..._args: unknown[]) => 0) as unknown as typeof setInterval,
    logger: { log: () => {} },
  });

  expect(existsSync(join(home, ".agentctl", "agents.db"))).toBe(true);
  expect(runtime.db).toBeDefined();
  runtime.db.close();
});
```

Add imports if missing:
```typescript
import { existsSync } from "fs";
```

- [ ] **Step 2: Run test**

```bash
~/.bun/bin/bun test src/daemon/startup.test.ts
```

Ожидается: PASS — verifies existing behavior. Daemon already creates fresh DB on missing file via `new Database(path, { create: true })`.

- [ ] **Step 3: Commit**

```bash
git add src/daemon/startup.test.ts
git commit -m "test: verify daemon creates fresh database on first start"
```

---

## Task 5: Storage documentation

**Files:**
- Create: `docs/storage.md`
- Modify: `docs/troubleshooting.md`

- [ ] **Step 1: Create `docs/storage.md`**

```markdown
# Storage

agentctl stores all runtime state locally in `~/.agentctl/`.

## Files

- `~/.agentctl/agents.db` — SQLite database. Tracks agent sessions, tool calls, pending injections, daemon boot history.
- `~/.agentctl/agents.db-wal` — SQLite write-ahead log. Created automatically when WAL mode is active.
- `~/.agentctl/agents.db-shm` — SQLite shared memory file for WAL coordination.
- `~/.agentctl/auth-token` — local auth token used by CLI, TUI, and hooks to authenticate to the daemon.

All four files belong to the same single-daemon control plane. Move them aside or delete them as a group when recovering from corruption.

## Schema version

agentctl v1.0.0 supports schema version 1 only. The daemon records the version in the `schema_metadata` table on first start.

If the database contains a different schema version, the daemon refuses to start with an actionable error like:

```
agentctl daemon does not support schema version N. This binary supports schema version 1. Upgrade the daemon binary or move ~/.agentctl/agents.db aside.
```

This protects user data from accidental schema downgrade or corruption from a future-version daemon writing to an older one.

## WAL mode

The daemon enables `PRAGMA journal_mode = WAL` at startup. WAL has two benefits for a single-process daemon:

- Reads are not blocked by writes.
- Crash recovery is automatic on next open.

WAL files (`-wal`, `-shm`) are normal and expected to exist alongside `agents.db`.

## Concurrency model

agentctl is a single-user, single-daemon, single-connection control plane. The daemon process owns the only writer connection to `agents.db`. Hooks, CLI, and TUI never open the database directly — they go through the daemon over `127.0.0.1:47823`.

Because Bun executes JavaScript on a single event loop and `bun:sqlite` operates synchronously, all daemon database operations are serialized in the order they arrive. There are no external writers to coordinate with, and no transaction wrapping is required across handler statements.

## Stale reconciliation

On startup, the daemon marks any `running` agent in the database as `stale`. The new daemon cannot prove old sessions are still active. Stale agents appear in `agentctl agents` output as historical records.

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

This discards agent history, pending injections, and token counters. The auth token is preserved.

## Failure model

- **Hooks (pre/post tool, subagent start/stop):** fail-open. If the daemon is unreachable or returns an error, hooks exit `0` and Claude Code is never blocked by agentctl being down.
- **CLI commands (`inject`, `cap`, `kill`, `agents`, `status`, `watch`):** fail-closed. If the daemon returns an error or is unreachable, the CLI prints the error to stderr and exits non-zero. Run `agentctl status` first to verify the daemon is reachable.
```

- [ ] **Step 2: Add reference from `docs/troubleshooting.md`**

В существующей секции `## Stale DB state` после блока `mv ~/.agentctl/agents.db ~/.agentctl/agents.db.backup` добавить параграф:

```markdown
For full recovery instructions covering `agents.db-wal` and `agents.db-shm`, the schema version policy, and the failure model, see `docs/storage.md`.
```

- [ ] **Step 3: Verify drift check passes**

```bash
~/.bun/bin/bun run scripts/check-public-doc-drift.ts
```

Ожидается: `Public docs drift check passed`

- [ ] **Step 4: Commit**

```bash
git add docs/storage.md docs/troubleshooting.md
git commit -m "docs: add storage reference covering schema, WAL, recovery, failure model"
```

---

## Task 6: Update Phase 03 work items and ROADMAP

**Files:**
- Modify: `docs/roadmap/03-data-integrity-and-storage.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update Phase 03 work items**

Заменить блок `## Work items`:

```markdown
- [x] P1 / Done — schema v1 compatibility expectation: `assertSupportedSchema` отказывается стартовать на не-v1 базе. Документировано в `docs/storage.md`.
- [x] P1 / Done — transaction semantics: проверено, что handlers выполняют не более одного write на code path; нет multi-write atomicity gaps. См. observations в `docs/storage.md`.
- [x] P1 / Done — migration acceptance: v1.0.0 поддерживает только schema v1. Future migrations реализуются позже.
- [x] P1 / Done — concurrent hook request behavior: single-daemon single-connection model, операции сериализованы в Bun event loop. Документировано.
- [x] P1 / Done — corruption/recovery scenario: процедура (move aside → restart) задокументирована в `docs/storage.md`. Verified by "creates a fresh database when one does not exist" test.
- [x] P2 / Done — retention cleanup at scale: 10k+ tool_calls + 1k delivered injections корректно cleanup'ятся в одном проходе.
- [x] P2 / Done — DB lock/failure behavior: hooks fail-open, CLI fail-closed; задокументировано.
```

- [ ] **Step 2: Update ROADMAP.md**

Заменить:
```
| 03 Data integrity and storage | P1 | Not started | Закрывает migration, recovery и compatibility confidence. |
```

На:
```
| 03 Data integrity and storage | P1 | Done | Закрывает migration, recovery и compatibility confidence. |
```

- [ ] **Step 3: Drift check + final test run**

```bash
~/.bun/bin/bun run scripts/check-public-doc-drift.ts
~/.bun/bin/bun test 2>&1 | tail -5
~/.bun/bin/bun run typecheck
```

Ожидается: drift passed, все тесты pass, typecheck OK.

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap/03-data-integrity-and-storage.md ROADMAP.md
git commit -m "docs: mark phase 03 data integrity and storage complete"
```

---

## Acceptance Criteria Check

| Критерий | Покрытие |
|----------|---------|
| Storage docs описывают path, WAL, retention, stale, schema version | `docs/storage.md` (Task 5) |
| Tests подтверждают startup reconciliation and cleanup | Existing `prepareDaemonDatabase` test + new retention scale test (Task 3) |
| Corruption/recovery path описан и verified | Task 5 docs + Task 4 test |
| Compatibility rule для v1 schema зафиксирован | Task 1 + Task 5 docs |
| No DB lock failure in single-daemon model | Single-connection model documented in Task 5 |
