# 00 Audit Baseline

## Goal

Зафиксировать проверенный audit baseline, от которого строится Production v1.0.0 roadmap.

## Audit basis

Исходный audit verdict: `NOT_READY_FOR_PUBLIC_RELEASE`.

Проверенные успешные факты:

- `bun install --frozen-lockfile` прошел: lockfile согласован с installed dependencies.
- `bun test` прошел: `130 pass`, `0 fail`, 34 test files.
- `bun run typecheck` прошел: `tsc --noEmit`, exit `0`.
- `bun run check:public-doc-drift` прошел.
- `bun run build` прошел один раз при `PATH=~/.bun/bin:/usr/bin:/bin`.
- Release archives были созданы и содержали `agentctl`, `agentctl-daemon`, `hooks/pre-tool-use`, `hooks/post-tool-use`, `hooks/subagent-start`, `hooks/subagent-stop`.
- Secret scan не нашел реальных credential patterns; найденные token strings были test/local auth references.

Проверенные блокеры (исходное состояние на момент audit):

- ~~отсутствует `LICENSE` file~~ — **Done (Phase 01)**: `LICENSE` добавлен.
- ~~`package.json` не содержит `license`, `repository`, `engines`~~ — **Done (Phase 01)**: поля `license`, `repository`, `bugs`, `homepage`, `engines` добавлены. Поле `packageManager` по-прежнему отсутствует — оставлен как remaining item в Phase 01.
- `bun run check:public-install-url` завершился `ConnectionRefused` — **Not done**: требует public repository.
- `scripts/smoke-install.sh` завершился failure при скачивании `bun-darwin-aarch64-v1.3.13` — **Not done**: требует public release assets; локальная сборка работает.
- ~~`bun run measure:hooks` завершился `Failed to start server. Is port 47823 in use?`~~ — **Done (Phase 02)**: normal p95 ≈200ms < 250ms, daemon-unavailable p95 ≈41ms < 75ms при свободном порту.
- ~~tracked launch checklist file содержит public launch checklist и unchecked public install URL confirmation~~ — **Done (Phase 01)**: `TODO.md` убран из git tracking.

## Scope

- Используется только verified audit evidence.
- Baseline покрывает repository readiness, runtime, security, storage, build, tests, CI/release и docs.

## Out of scope

- Новые product features.
- Изменения application source code.
- Переоценка audit verdict без новых verification evidence.

## Work items

- [x] P0 / Done — перенести audit verdict `NOT_READY_FOR_PUBLIC_RELEASE` в roadmap baseline.
- [x] P0 / Done — перечислить verified blockers, которые напрямую влияют на public release.
- [x] P1 / Done — перечислить unknowns, которые требуют отдельной verification перед v1.
- [ ] P0 / Not started — обновить baseline только после нового полного audit run с сохраненными command outputs.

## Acceptance criteria

- Baseline содержит только факты из audit report.
- Каждый blocker связан с observed command output или file inspection.
- Baseline не содержит unrelated feature ideas.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run typecheck
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url
```

## Release impact

Этот файл является traceability anchor для Production v1.0.0 work. Если baseline остается `NOT_READY_FOR_PUBLIC_RELEASE`, `v1.0.0` tag не проходит go/no-go gate.

## Dependencies / ordering

- Должен оставаться первым phase document.
- Все последующие phase items должны ссылаться на этот baseline или на явные v1 gates.

## Open questions

- Где хранить полный audit report как immutable artifact: conversation context, `docs/`, GitHub issue или release-readiness artifact.
- Какая дата считается официальной baseline date для первого public readiness cycle.
