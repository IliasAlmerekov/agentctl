# 03 Data Integrity And Storage

## Goal

Зафиксировать и проверить storage guarantees для `~/.agentctl/agents.db` перед Production v1.0.0.

## Audit basis

- SQLite database path: `~/.agentctl/agents.db`.
- Daemon включает `PRAGMA journal_mode = WAL`.
- Schema version metadata присутствует: `CURRENT_SCHEMA_VERSION = 1`.
- Startup reconciliation marks previous `running` sessions as `stale`.
- Retention cleanup удаляет old `tool_calls` and delivered injections.
- Migration logic beyond schema version metadata не наблюдалась.
- Corruption recovery behavior не проверялся runtime-командой.

## Scope

- Database location and permissions assumptions.
- WAL mode behavior.
- Schema versioning and migrations.
- Transaction boundaries for multi-step state changes.
- Concurrent access model.
- Corruption/recovery handling.
- Retention and cleanup.
- Compatibility across versions.

## Out of scope

- External database backend.
- Multi-user shared storage.
- Cloud sync.

## Work items

- [x] P1 / Done — schema v1 compatibility: `assertSupportedSchema` отказывается стартовать на не-v1 базе с actionable error. Документировано в `docs/storage.md`.
- [x] P1 / Done — transaction semantics: проверено, что handlers выполняют не более одного write на code path; multi-write atomicity gaps отсутствуют. Observations в `docs/storage.md` (Concurrency model).
- [x] P1 / Done — migration acceptance: v1.0.0 поддерживает только schema v1; future migrations реализуются позже. Зафиксировано как explicit policy в `docs/storage.md`.
- [x] P1 / Done — concurrent hook requests: single-daemon single-connection model, операции сериализованы в Bun event loop. Документировано в `docs/storage.md`.
- [x] P1 / Done — corruption/recovery scenario: процедура (move aside `.db`, `.db-wal`, `.db-shm` → restart) задокументирована. "Creates fresh database when one does not exist" test verifies recovery path в `src/daemon/startup.test.ts`.
- [x] P2 / Done — retention cleanup at scale: 10k tool_calls + 1k delivered injections корректно очищаются (`src/daemon/db.test.ts`).
- [x] P2 / Done — DB failure behavior: hooks fail-open (existing), CLI fail-closed (existing); политика зафиксирована в `docs/storage.md`.

## Acceptance criteria

- Storage docs описывают path, WAL, retention, stale reconciliation и schema version.
- Tests или manual verification подтверждают startup reconciliation and cleanup.
- Corruption/recovery path описан и проверен на local install.
- Compatibility rule для v1 schema зафиксирован.
- No observed DB lock failure in supported single-daemon model.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test src/daemon/db.test.ts src/daemon/http.test.ts src/daemon/handlers/pre-tool.test.ts
rtk rg -n "CURRENT_SCHEMA_VERSION|PRAGMA journal_mode|cleanupOldRuntimeData|reconcileRunningAgents" src/daemon docs README.md -S
```

## Release impact

Storage failures can make external users lose pending injections, token counts, or session state. Эта фаза является P1 для production confidence и P0, если migration/corruption behavior blocks install or daemon startup.

## Dependencies / ordering

- Выполняется после runtime baseline.
- Corruption/recovery docs должны синхронизироваться с `docs/troubleshooting.md`.

## Open questions

- Должен ли `v1.0.0` гарантировать forward compatibility для pre-v1 databases.
- Какие database failure states должны fail-open для hooks и fail-closed для CLI.

