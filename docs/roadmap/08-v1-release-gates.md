# 08 v1 Release Gates

## Goal

Определить explicit go/no-go criteria для `v1.0.0` tag и public repository switch.

## Audit basis

- Current verdict: `NOT_READY_FOR_PUBLIC_RELEASE`.
- P0 blockers: ~~missing license~~ (Done), failed public install URL check, public release smoke, final version/tag alignment, and missing release-day GitHub Actions evidence.
- Passing local evidence: install frozen lockfile, test, typecheck, doc drift, local build, local Linux smoke install, archive inspection, checksum verification, hook latency, dependency audit, storage/runtime/docs gates.
- Remaining external unknowns: public URL availability after the repository is public, macOS runner evidence, clean GitHub Actions release rehearsal, and final `v1.0.0` version/tag wording.

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
- [ ] P0 / Blocked — public install gate: `bun run check:public-install-url` passes after the repository is public and the public `main` installer URL returns 200.
- [ ] P0 / In progress — build gate: `bun run build` passed locally with release `PATH`; clean GitHub Actions evidence still required before tag.
- [x] P0 / Done — artifact gate: all archives and `SHA256SUMS` inspected and verified.
- [ ] P0 / Blocked — install smoke gate: Linux x64 and macOS install smoke pass via `smoke:install:public` (not just local build). Local Linux `smoke:install` passed; public release smoke and macOS runner evidence remain required.
- [x] P0 / Done — hook latency gate: `bun run measure:hooks` passes with documented p95 (normal <250ms, unavailable <75ms).
- [ ] P0 / In progress — test gate: `bun install --frozen-lockfile`, `bun test`, and `bun run typecheck` passed locally; clean GitHub Actions evidence still required before tag.
- [x] P1 / Done — runtime gate: daemon restart, port conflict, WebSocket disconnect (auto-reconnect) and CLI failure modes verified.
- [x] P1 / Done — storage gate: schema v1, WAL, retention, stale reconciliation and recovery behavior verified in `src/daemon/db.test.ts`, `src/daemon/startup.test.ts`, and `docs/storage.md`.
- [x] P1 / Done — supply-chain gate: `bun run audit` completed on 2026-05-08 with `No vulnerabilities found`.
- [x] P1 / Done — docs gate: README, changelog/release notes, platform, security, hook contract, onboarding, test strategy and troubleshooting match verified behavior through `docs/onboarding.md`, `docs/test-strategy.md`, `docs/platforms.md`, `docs/security.md`, `docs/hook-contract.md`, and `docs/troubleshooting.md`.
- [x] P0 / Done — release workflow gate: workflow creates a draft release, runs smoke against draft assets, then promotes using `gh release edit --draft=false`; smoke passes before publication.
- [ ] P0 / Blocked — version/tag gate: final `v1.0.0` version bump, release tag, changelog and release notes wording happen only after all public gates pass.

## Acceptance criteria

Production v1.0.0 go requires all P0 gates `Done` and all P1 gates either `Done` or explicitly accepted with recorded rationale. Any P0 gate in `Blocked`, `Not started`, `In progress` or `Unknown` is a no-go.

## Current No-Go Blockers

- repository is public and `bun run check:public-install-url` returns 200 for the public `main` installer URL.
- public release assets exist and `smoke:install:public` passes for Linux x64 and macOS.
- clean GitHub Actions run proves install, test, typecheck, build, artifact inspection and release smoke.
- final `v1.0.0` version bump, release tag, changelog and release notes wording are intentionally updated.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun install --frozen-lockfile
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run typecheck
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run build
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run audit
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
