# agentctl Production v1.0.0 Roadmap

Цель этого roadmap — довести agentctl из текущего private-состояния до публичного репозитория и Production v1.0.0 release без расширения продуктовой поверхности за пределы текущей модели: `inject`, `cap`, `kill`, `agents`, `watch`, `status`, install/uninstall, daemon, hooks и release artifacts.

## Audit Readiness Verdict

Исходный audit verdict: `NOT_READY_FOR_PUBLIC_RELEASE`.

Основание из audit baseline:

- отсутствуют `LICENSE` file и `license` metadata в `package.json`;
- `bun run check:public-install-url` завершился ошибкой `ConnectionRefused`;
- `scripts/smoke-install.sh` не прошел в audit run из-за failure при скачивании `bun-darwin-aarch64-v1.3.13`;
- `bun run measure:hooks` не прошел: `Failed to start server. Is port 47823 in use?`;
- tracked launch checklist file содержит незакрытое public launch состояние;
- `bun test`, `bun run typecheck`, `check:public-doc-drift` и один release build с полным `PATH` прошли.

## Roadmap Index

- [00 Audit Baseline](docs/roadmap/00-audit-baseline.md)
- [01 Public Repository Readiness](docs/roadmap/01-public-repository-readiness.md)
- [02 Runtime Architecture Hardening](docs/roadmap/02-runtime-architecture-hardening.md)
- [03 Data Integrity And Storage](docs/roadmap/03-data-integrity-and-storage.md)
- [04 Security And Local Attack Surface](docs/roadmap/04-security-and-local-attack-surface.md)
- [05 Build Distribution And Release](docs/roadmap/05-build-distribution-and-release.md)
- [06 Test Strategy For v1](docs/roadmap/06-test-strategy-for-v1.md)
- [07 Documentation And User Onboarding](docs/roadmap/07-documentation-and-user-onboarding.md)
- [08 v1 Release Gates](docs/roadmap/08-v1-release-gates.md)

## Phase Summary

| Phase | Priority | Status | Release impact |
|---|---|---|---|
| 00 Audit baseline | P0 | Done | Фиксирует verified source of truth для v1 planning. |
| 01 Public repository readiness | P0 | Done | Блокирует переключение репозитория из private в public. |
| 02 Runtime architecture hardening | P1 | Done | Закрывает daemon/TUI/WebSocket/runtime robustness gaps. |
| 03 Data integrity and storage | P1 | Done | Закрывает migration, recovery и compatibility confidence. |
| 04 Security and local attack surface | P0 | Not started | Закрывает validation, local attack surface и supply-chain exposure. |
| 05 Build distribution and release | P0 | Blocked | Блокируется непрошедшими public URL, smoke и hook latency checks. |
| 06 Test strategy for v1 | P1 | Not started | Делает v1 gates воспроизводимыми в local и CI. |
| 07 Documentation and onboarding | P1 | Not started | Делает external-user docs точными и проверяемыми. |
| 08 v1 release gates | P0 | Not started | Определяет final go/no-go перед `v1.0.0` tag. |

## Definition Of Production v1.0.0

agentctl считается Production v1.0.0, когда одновременно истинны все пункты:

- репозиторий можно открыть публично без незакрытых legal, metadata, private artifact или secret exposure gaps;
- install path из `README.md` реально доступен извне и ведет к проверяемым GitHub Release artifacts;
- `agentctl-darwin-arm64.tar.gz`, `agentctl-darwin-x64.tar.gz`, `agentctl-linux-x64.tar.gz` и `SHA256SUMS` создаются воспроизводимо и проходят install smoke;
- daemon стабильно работает как local single-user control plane на `127.0.0.1:47823`;
- CLI, hooks, TUI, WebSocket и SQLite behavior проверены automated commands;
- public docs описывают только реализованное и проверенное поведение;
- release workflow может опубликовать `v1.0.0` artifacts без ручной сборки на рабочей машине.

## Release Gates

- [x] P0 / Done — `LICENSE` и public package metadata присутствуют и проверены.
- [ ] P0 / Blocked — `bun run check:public-install-url` проходит против публичного `main`.
- [ ] P0 / Blocked — `bun run smoke:install` проходит на Linux x64 и macOS runner.
- [x] P0 / Done — `bun run measure:hooks` проходит при свободном `127.0.0.1:47823` и фиксирует p95 в documented budget.
- [ ] P0 / Not started — public-facing tracked docs не содержат незакрытого launch planning состояния.
- [ ] P0 / Not started — `bun install --frozen-lockfile`, `bun test`, `bun run typecheck`, `bun run build` проходят в clean environment.
- [ ] P0 / Not started — release artifacts inspected: archive composition, executable files, checksums.
- [ ] P0 / Not started — GitHub Actions release path проверен dry-run или tag-protected rehearsal без непреднамеренной публикации.

## Non-Goals For v1.0.0

- Windows packaging.
- Linux arm64 packaging.
- Remote daemon.
- Web UI.
- Multi-user authorization model.
- External observability backend.
- Native Claude Code agent-control API integration beyond current hooks contract.
