# 04 Security And Local Attack Surface

## Goal

Сделать local security boundary agentctl явной, проверенной и достаточной для public Production v1.0.0.

## Audit basis (исходное состояние на момент audit)

- Daemon binds only to `127.0.0.1:47823` (актуально).
- CLI/hooks use `X-Agentctl-Token`; WebSocket uses query parameter `token` (актуально).
- Token file path: `~/.agentctl/auth-token`, mode `0600` in installer (актуально).
- `docs/security.md` documents same-user limitations (актуально, расширено в Phase 04).
- Secret scan не выявил real credentials (актуально).
- ~~HTTP handlers use `await req.json()` without local malformed JSON handling~~ — закрыто в Phase 04: `readBoundedJson` возвращает 400 на malformed JSON и 413 на oversized body.
- ~~Dependency vulnerability state was unknown; no audit command in `package.json`~~ — закрыто в Phase 04: `bun audit` (`bun run audit`); первый запуск — "No vulnerabilities found".
- GitHub Actions use `contents: read` for CI and `contents: write` for release (актуально, verified).

## Scope

- Local HTTP/WebSocket attack surface.
- Request validation.
- Authentication/authorization model.
- Input validation for CLI and daemon endpoints.
- Shell/path injection risks in install/uninstall/release scripts.
- Sensitive logs and token exposure.
- Supply-chain and dependency exposure.
- GitHub Actions permissions.

## Out of scope

- Protection against same-user malicious code beyond documented local model.
- Networked authentication.
- Remote daemon security.
- Sandbox enforcement.

## Work items

- [x] P0 / Done — auth tests cover CLI HTTP endpoints, hook endpoints, и WebSocket (existing `src/daemon/http.test.ts` "covers missing, invalid, and valid auth for ...").
- [x] P0 / Done — WebSocket rejects missing/invalid `token` query parameter (covered).
- [x] P1 / Done — malformed JSON и oversized body: `readBoundedJson` возвращает 400/413 per-endpoint (control 1 MB, hook 10 MB). Тесты в `src/daemon/http.test.ts` "daemon HTTP body limits and validation".
- [x] P1 / Done — CLI input validation: `validateInjectArgs` (empty session/message, 64 KB UTF-8 limit), `validateCapArgs` (positive integer tokens, non-empty session id). Тесты в `inject.test.ts` и `cap.test.ts`.
- [x] P1 / Done — shell script audit: `install.sh` использует `mktemp -d` + quoted variables; единственный `rm -rf` цепляется на безопасную mktemp директорию.
- [x] P1 / Done — daemon log redaction: regression-тест "startup logs do not include the auth token". Verified что нет log statements печатающих token или WS URL.
- [x] P1 / Done — dependency vulnerability state: `bun audit` через `bun run audit`; результат "No vulnerabilities found" зафиксирован в `docs/security.md`.
- [x] P1 / Done — GitHub Actions permissions: `ci.yml` и `install-smoke.yml` используют `contents: read`; `release.yml` использует `contents: write`. Least-privilege подтверждено.
- [x] P2 / Done — WebSocket token query exposure задокументировано как accepted local-only tradeoff в `docs/security.md` (Log redaction policy).

## Acceptance criteria

- Auth tests cover CLI endpoints, hook endpoints and WebSocket.
- Malformed request behavior is deterministic and covered by tests or documented manual verification.
- Secret scan returns no real credentials.
- Dependency health state is known for v1.0.0 release date.
- GitHub Actions permissions are reviewed and match required operations.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test src/daemon/http.test.ts src/hooks/daemon-client.test.ts src/release/local-auth-gate.test.ts
rtk rg -n "(ghp_|github_pat_|sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|password\\s*=|secret\\s*=|token\\s*=)" README.md docs src scripts install.sh package.json .github -S
rtk rg -n "rm -rf|eval\\(|exec\\(|Bun\\.spawn|spawnSync|curl|chmod|systemctl|launchctl|pm2" install.sh scripts src .github -S
rtk rg -n "permissions:|contents:" .github/workflows -S
```

## Release impact

Security baseline is P0 for public repository visibility. Unknown dependency vulnerability state is P1 until a verified audit path exists.

## Dependencies / ordering

- Public repository readiness must identify which files become visible.
- Build/release phase must confirm artifacts do not include unexpected files.

## Open questions

- Какой dependency audit tool считается authoritative для Bun project.
- Есть ли v1 limit для injection message size и request body size.
- Должны ли token-bearing WebSocket URLs appear in any user-visible logs.

