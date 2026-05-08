# 05 Build Distribution And Release

## Goal

Сделать release artifact generation, validation and publication reproducible for Production v1.0.0.

## Audit basis

- Release manifest builds `darwin-arm64`, `darwin-x64`, `linux-x64`.
- Archive composition inspected: CLI binary, daemon binary, four hook binaries.
- `SHA256SUMS` generated for release archives.
- `bun run build` passed once with full `PATH`.
- `bun run build` failed without `bun` in nested script PATH.
- `scripts/smoke-install.sh` failed during audit because build attempted target download and received `ConnectionRefused`.
- After failed smoke/build, `dist` contained incomplete `.release/` state.
- Public install URL check failed with `ConnectionRefused`.

## Scope

- `bun build --compile`
- Standalone binary assumptions.
- `tar.gz` artifacts.
- Hook script packaging.
- Platform matrix.
- Release reproducibility.
- Versioning.
- CI release workflow.
- First public release artifact validation.

## Out of scope

- New supported platforms beyond macOS arm64, macOS x64 and Linux x64.
- NPM package distribution.
- Homebrew, apt, winget or other package managers.

## Work items

- [ ] P0 / Blocked — make `bun run check:public-install-url` pass against public `main` URL.
- [ ] P0 / Blocked — make `bun run smoke:install` pass from local release artifacts on Linux x64.
- [ ] P0 / Blocked — verify release smoke on macOS runner using GitHub Actions or equivalent logged evidence.
- [ ] P0 / Not started — verify `bun run build` in clean environment where required Bun compile targets are already available or downloadable.
- [ ] P0 / Not started — inspect every `dist/agentctl-*.tar.gz` archive and verify exact expected file list.
- [ ] P0 / Not started — verify `SHA256SUMS` entries match archive names and checksums before install.
- [ ] P1 / Not started — document build environment prerequisites: Bun version, `tar`, network access for compile targets, supported OS/arch.
- [ ] P1 / Not started — verify failed build cleanup behavior and ensure release artifacts are not published from partial `dist`.
- [ ] P1 / Not started — verify `package.json` version, CLI `.version("0.1.0")`, changelog and release tag strategy converge before `v1.0.0`.
- [ ] P0 / Not started — изменить `release.yml`: smoke должен проходить до публикации релиза. Текущий workflow публикует через `gh release create` в job `publish-release`, а `release-smoke` запускается только после (`needs: publish-release`). Если smoke падает — плохой релиз уже публичен. Исправление: `gh release create --draft`, затем `gh release edit --draft=false` только после того, как все smoke матрицы прошли.
- [ ] P1 / Not started — run release workflow rehearsal that does not publish external artifacts unless intentionally triggered by a protected tag.

## Acceptance criteria

- `bun run build` creates exactly three archives plus `SHA256SUMS`.
- Each archive contains only `./agentctl`, `./agentctl-daemon`, `./hooks/pre-tool-use`, `./hooks/post-tool-use`, `./hooks/subagent-start`, `./hooks/subagent-stop` and directories.
- `install.sh` installs from release artifacts, verifies checksums and patches hooks.
- Local and CI smoke evidence exists for Linux x64 and macOS.
- Version surfaces are consistent for `v1.0.0`.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run build
rtk ls -la dist
rtk cat dist/SHA256SUMS
rtk tar -tzf dist/agentctl-linux-x64.tar.gz
rtk tar -tzf dist/agentctl-darwin-arm64.tar.gz
rtk tar -tzf dist/agentctl-darwin-x64.tar.gz
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install
# Для проверки release assets (не локальной сборки):
# AGENTCTL_VERSION=v1.0.0 rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install:public
```

## Release impact

Эта фаза является P0 для first public release artifacts. Пока public URL, smoke install или build reproducibility не проходят, `v1.0.0` tag остается blocked.

## Dependencies / ordering

- Public repository readiness must complete before public install URL can be authoritative.
- Runtime and security gates should complete before artifact validation.

## Open questions

- Как фиксировать evidence для macOS smoke: GitHub Actions run ID, local maintainer machine или оба.
- Должен ли `v1.0.0` tag использовать generated GitHub release notes или curated `docs/release-notes.md`.
- Какой exact Bun version policy действует для Production v1.0.0.

