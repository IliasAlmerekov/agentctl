# 01 Public Repository Readiness

## Goal

Подготовить private repository к безопасному переключению в public без legal ambiguity, stale launch artifacts, accidental private content или недостоверных public docs.

## Audit basis

- Audit verdict: `NOT_READY_FOR_PUBLIC_RELEASE`.
- Отсутствуют `LICENSE` file и `license` metadata.
- `package.json` не содержит `repository`, `engines`, `packageManager`.
- Tracked launch checklist file содержит public launch checklist и unchecked public install URL confirmation.
- Secret scan не выявил real credentials.
- `README.md`, `CHANGELOG.md`, `docs/release-notes.md`, `docs/security.md`, `docs/platforms.md`, `docs/troubleshooting.md` существуют и частично синхронизированы тестами.

## Scope

- `README.md`
- `LICENSE`
- `package.json`
- `CHANGELOG.md`
- `docs/release-notes.md`
- `docs/security.md`
- `docs/platforms.md`
- `docs/troubleshooting.md`
- `AGENTCTL.md`
- tracked planning/internal files visible after public switch
- secret/private marker scan

## Out of scope

- Product features beyond documented CLI/daemon/hooks/TUI behavior.
- NPM package publishing.
- Website, landing page или marketing copy.

## Work items

- [x] P0 / Done — добавить public license artifact и отразить выбранную лицензию в `package.json`.
- [x] P0 / Done — добавить public repository metadata в `package.json`: `repository`, `bugs`, `homepage`.
- [x] P1 / Done — зафиксировать Bun/runtime expectation в `engines.bun` в `package.json`.
- [x] P0 / Done — классифицировать tracked launch checklist file: `TODO.md` убран из git tracking через `.gitignore`.
- [x] P0 / Done — выполнить targeted scan для private markers, launch checklist markers, credentials, personal paths — scan чист.
- [ ] P1 / Not started — добавить `packageManager` в `package.json` (выявлено в audit baseline; отсутствует после Phase 01).
- [ ] P1 / Not started — сверить README install section с фактическим `install.sh`, `docs/platforms.md` и release artifact names.
- [ ] P1 / Not started — сверить `CHANGELOG.md` и `docs/release-notes.md` с planned `v1.0.0` release shape.
- [ ] P1 / Not started — проверить, что public docs явно описывают beta-to-v1 limitations: local-only, no Windows, no Linux arm64, hooks fail-open, same-user token limit.

## Acceptance criteria

- `LICENSE` file присутствует в repository root.
- `package.json` содержит public-ready metadata и не содержит private/internal package references.
- Public docs не содержат unchecked launch checklist state.
- Secret/private marker scan не находит real credentials, private package registries, private repo URLs или local personal paths outside examples/tests.
- `bun run check:public-doc-drift` проходит.

## Verification commands

```bash
rtk git ls-files LICENSE LICENSE.md SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md README.md CHANGELOG.md package.json
rtk rg -n "(ghp_|github_pat_|sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|password\\s*=|secret\\s*=|token\\s*=)" README.md docs src scripts install.sh package.json .github -S
rtk rg -n "PRIVATE|T[O]DO|FIXME|HACK|npm.pkg.github.com|git@|/home/|Users/" README.md docs src scripts install.sh package.json .github ROADMAP.md -S
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
```

## Release impact

Эта фаза блокирует public repository switch и любой `v1.0.0` tag. Public repository без license и accurate public metadata остается release-blocking state.

## Dependencies / ordering

- Выполняется до public URL verification и release announcement.
- Должна завершиться до Phase 08 go/no-go.

## Open questions

- Какая лицензия является официальной для agentctl.
- Должен ли tracked launch checklist file и historical planning docs оставаться tracked после public switch.
- Нужны ли `SECURITY.md` и `CONTRIBUTING.md` для v1 или достаточно существующего `docs/security.md`.
