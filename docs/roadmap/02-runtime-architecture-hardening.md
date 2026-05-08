# 02 Runtime Architecture Hardening

## Goal

Довести runtime behavior CLI, daemon, hooks, WebSocket и TUI до уровня Production v1.0.0 confidence без изменения текущей продуктовой поверхности.

## Audit basis (исходное состояние на момент audit)

- Daemon bind address проверен: `127.0.0.1:47823` (актуально).
- Startup errors покрывают missing/empty token и port-in-use (актуально, тесты в `src/daemon/startup.test.ts`).
- ~~TUI `watch` открывает один WebSocket, отображает disconnect, но reconnect/backoff logic в inspected code не наблюдалась~~ — закрыто в Phase 02: добавлен auto-reconnect с exponential backoff (`reconnectDelay`).
- `cmdWatch` использует Ink и `process.exit(0)` на `q` (актуально, плюс non-TTY guard).
- Hook-to-daemon failure behavior fail-open и использует `HOOK_TIMEOUT_MS = 130` (актуально).
- ~~`bun run measure:hooks` не прошел из-за occupied `127.0.0.1:47823`~~ — закрыто в Phase 02: normal p95 ≈200ms < 250ms, daemon-unavailable p95 ≈41ms < 75ms при свободном порту.

Текущее состояние отражено в work items ниже.

## Scope

- CLI command lifecycle and exit behavior.
- Daemon startup, restart, shutdown and port conflict behavior.
- Process boundaries between CLI, daemon, hooks and TUI.
- WebSocket disconnect/reconnect states.
- Non-TTY behavior for `watch`.
- Hook-to-daemon timeout/failure semantics.

## Out of scope

- Remote daemon.
- Multi-user daemon.
- Web UI.
- Native Claude Code API beyond current hooks.

## Work items

- [x] P0 / Done — `bun run measure:hooks` прошёл при свободном `127.0.0.1:47823`. Evidence: normal p95 ≈200ms (budget 250ms), daemon-unavailable p95 ≈41ms (budget 75ms).
- [x] P1 / Done — `watch` в non-TTY: `watchGuard()` exits 1 с сообщением "agentctl watch requires a TTY". Тесты в `src/cli/commands/watch.test.ts`.
- [x] P1 / Done — TUI auto-reconnect с exponential backoff (1s → 2s → 4s → … → 10s). Disconnect отображается как "daemon disconnected — reconnecting…". `reconnectDelay()` тестируется.
- [x] P1 / Done — cleanup behavior: `q` → `process.exit(0)`; `Ctrl+C` / unmount → React cleanup закрывает WebSocket и cancels reconnect timer через `cancelled` флаг и `clearTimeout`.
- [x] P1 / Done — CLI exit-code matrix покрыт `renderInjectResult` / `renderCapResult` / `renderKillResult` тестами: `not_found` → stderr + exitCode 1. Daemon-unavailable / missing auth token обрабатывается catch блоком в `cmdInject` / `cmdCap` / `cmdKill` → `console.error` + `process.exit(1)`.
- [x] P1 / Done — daemon restart behavior: `prepareDaemonDatabase` в `src/daemon/db.test.ts` проверяет, что running sessions становятся `stale` после рестарта. После Phase 02 TUI auto-reconnect делает обновлённое состояние observable.
- [ ] P2 / Not started — проверить terminal resize behavior for Ink layout и отсутствие layout crash. Не блокирует v1.0.0 — Ink handles resize natively.

## Acceptance criteria

- Hook latency command проходит и фиксирует p95 в documented budget.
- `watch` имеет documented and verified behavior для TTY и non-TTY cases.
- Daemon restart scenario проверен командой или automated test.
- CLI failure modes имеют стабильные exit codes и stream separation.
- Port conflict behavior воспроизводимо проверен.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run measure:hooks
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test src/daemon/startup.test.ts src/daemon/db.test.ts src/hooks/daemon-client.test.ts
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run src/cli/index.ts --help
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run src/cli/index.ts status
```

## Release impact

Фаза не добавляет новые controls, но определяет надежность runtime boundaries. Непройденный hook latency check остается P0 blocker для v1.0.0.

## Dependencies / ordering

- Зависит от свободного local daemon port during verification.
- Должна предшествовать final install smoke и release artifact validation.

## Open questions

- Должен ли `watch` завершаться non-zero в non-TTY или показывать plain fallback.
- Какой reconnect behavior считается достаточным для Production v1.0.0: manual restart, automatic reconnect или explicit disconnected state.

