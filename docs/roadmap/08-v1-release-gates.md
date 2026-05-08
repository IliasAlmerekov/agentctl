# 08 v1 Release Gates

## Goal

Определить explicit go/no-go criteria для `v1.0.0` tag и public repository switch.

## Audit basis

- Current verdict: `NOT_READY_FOR_PUBLIC_RELEASE`.
- P0 blockers: ~~missing license~~ (Done), failed public install URL check, failed smoke install, ~~failed hook latency~~ (Done), ~~tracked public launch checklist~~ (Done).
- Passing evidence: install frozen lockfile, test, typecheck, doc drift, one build with full PATH, archive inspection.
- Unknowns: external public URL availability, dependency vulnerability state, GitHub Actions real execution, macOS runtime behavior, TUI non-TTY/resize (Done), SQLite corruption recovery.

## Scope

- Explicit release gates.
- Required checks before `v1.0.0`.
- Acceptance criteria.
- Go/no-go criteria.
- What must be true before tagging `v1.0.0`.

## Out of scope

- Release announcement content.
- Post-v1 feature backlog.
- Unsupported platforms.

## Work items

- [x] P0 / Done — repository public gate: `LICENSE`, metadata, secret scan and public-safe docs complete.
- [ ] P0 / Blocked — public install gate: `bun run check:public-install-url` passes (требует public repo).
- [ ] P0 / Blocked — build gate: `bun run build` passes in clean release environment.
- [ ] P0 / Blocked — artifact gate: all archives and `SHA256SUMS` inspected and verified.
- [ ] P0 / Blocked — install smoke gate: Linux x64 and macOS install smoke pass via `smoke:install:public` (not local build). Smoke must pass **before** release is published — see smoke-before-publish work item in Phase 05.
- [x] P0 / Done — hook latency gate: `bun run measure:hooks` passes with documented p95 (normal <250ms, unavailable <75ms).
- [ ] P0 / Not started — test gate: `bun install --frozen-lockfile`, `bun test`, `bun run typecheck` pass.
- [x] P1 / Done — runtime gate: daemon restart, port conflict, WebSocket disconnect (auto-reconnect) and CLI failure modes verified.
- [ ] P1 / Not started — storage gate: schema v1, WAL, retention, stale reconciliation and recovery behavior verified.
- [ ] P1 / Unknown — supply-chain gate: dependency vulnerability state known and recorded.
- [ ] P1 / Not started — docs gate: README, changelog/release notes, platform, security, hook contract and troubleshooting match verified behavior.
- [ ] P0 / Not started — release workflow gate: smoke runs before `gh release create`; workflow uses `--draft` pattern or equivalent to prevent publishing before smoke passes.

## Acceptance criteria

Production v1.0.0 go requires all P0 gates `Done` and all P1 gates either `Done` or explicitly accepted with recorded rationale. Any P0 gate in `Blocked`, `Not started`, `In progress` or `Unknown` is a no-go.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun install --frozen-lockfile
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run typecheck
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run build
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url
# Локальная сборка (sanity check):
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install
# Release/public install path — обязательно для go/no-go:
AGENTCTL_VERSION=v1.0.0 rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install:public
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run measure:hooks
rtk ls -la dist
rtk cat dist/SHA256SUMS
rtk tar -tzf dist/agentctl-linux-x64.tar.gz
rtk tar -tzf dist/agentctl-darwin-arm64.tar.gz
rtk tar -tzf dist/agentctl-darwin-x64.tar.gz
rtk git status --short
```

## Release impact

Этот файл является final checklist для `v1.0.0`. Он переводит audit findings в binary go/no-go decision.

## Dependencies / ordering

- Phase 01 and Phase 05 must finish before public release.
- Phase 02, 03, 04, 06 and 07 must provide evidence or explicit accepted risk before tag.
- This phase runs last.

## Open questions

- Кто утверждает final go/no-go.
- Где сохраняется final command output evidence for `v1.0.0`.
- Должен ли repository switch to public происходить до или после first GitHub Release.

