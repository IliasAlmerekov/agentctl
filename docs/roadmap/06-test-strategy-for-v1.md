# 06 Test Strategy For v1

## Goal

Сформировать проверяемую test strategy для Production v1.0.0, основанную на audit evidence и release gates.

## Audit basis

- `bun test` прошел: `189 pass`, `0 fail` before this phase.
- Test files покрывают daemon HTTP/auth, DB startup/reconciliation, hook input, daemon client fail-open, CLI formatting, install script, release manifest, CI workflow and docs drift.
- `bun run lint` отсутствует.
- E2E public install не завершился в audit run.
- Hook latency command не прошел из-за occupied port.
- Runtime TUI resize, non-TTY behavior, SQLite corruption recovery, macOS runtime binaries и real GitHub Actions execution были unknowns. Phase 06 assigns each unknown to automated coverage, manual checklist, or external release gate in `docs/test-strategy.md`.

## Scope

- Unit tests.
- Integration tests.
- CLI tests.
- Daemon tests.
- WebSocket tests.
- SQLite tests.
- Hook tests.
- Release/build tests.
- Test commands and coverage expectations.

## Out of scope

- Coverage percentage mandate without tooling.
- Browser/UI visual tests for non-existent Web UI.
- Tests for unsupported platforms.

## Work items

- [x] P0 / Done — define mandatory local pre-release command set: install, test, typecheck, build, public URL, smoke install, hook latency. See `docs/test-strategy.md`.
- [x] P1 / Done — add or identify integration tests for WebSocket reconnect/disconnect behavior. Covered by `src/cli/commands/watch.test.ts` and `src/daemon/http.test.ts`.
- [x] P1 / Done — add or identify tests for malformed daemon request JSON and invalid CLI input. Covered by `src/daemon/http.test.ts`, `src/cli/commands/inject.test.ts`, and `src/cli/commands/cap.test.ts`.
- [x] P1 / Done — add or identify storage tests for migration compatibility and DB failure behavior. Covered by `src/daemon/db.test.ts`, `src/daemon/startup.test.ts`, `src/hooks/daemon-client.test.ts`, and `docs/storage.md`.
- [x] P1 / Done — create documented manual test checklist for TUI non-TTY, resize and keyboard exit. See `docs/test-strategy.md`.
- [x] P1 / Done — capture release/build tests that inspect archive contents and checksum manifest. Covered by `src/release/build-artifacts.test.ts` and `src/release/ci-workflow.test.ts`.
- [x] P1 / Done — decide whether lint is required for v1; audit observed no `lint` script. Decision: no `lint` script is required for v1.0.0; `bun run typecheck` is the static gate.
- [x] P2 / Done — classify tests by unit/integration/release/docs in repository docs. See `docs/test-strategy.md`.

## Acceptance criteria

- v1 release gates reference concrete commands with expected pass/fail evidence.
- Known audit unknowns have verification owner: automated test, manual checklist or declared out-of-scope.
- No v1 gate depends on undocumented local state.
- CI covers test, typecheck, build and artifact smoke.

Status: Done. `docs/test-strategy.md` is the durable source for Phase 06.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun install --frozen-lockfile
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run typecheck
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run build
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run measure:hooks
```

## Release impact

Эта фаза превращает audit findings в repeatable release verification. Production v1.0.0 go/no-go now has a documented command set, coverage map, manual checklist, and lint policy in `docs/test-strategy.md`.

## Dependencies / ordering

- Depends on Phase 05 for build/smoke commands.
- Depends on Phase 02 for hook latency and TUI runtime expectations.
- Feeds Phase 08 release gates.

## Open questions

- Где хранить final signed-off manual evidence for macOS and TUI behavior during release day. The required checklist lives in `docs/test-strategy.md`.
