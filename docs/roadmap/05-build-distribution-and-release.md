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

- [ ] P0 / Blocked — make `bun run check:public-install-url` pass against public `main` URL. 2026-05-08: with network allowed, the check returned `404` because the repository is still private; no local code fix is expected until the public switch/main URL is reachable.
- [x] P0 / Done — make `bun run smoke:install` pass from local release artifacts on Linux x64. 2026-05-08: passed on `Linux-x86_64` after allowing Bun to download missing compile targets.
- [ ] P0 / Blocked — verify release smoke on macOS runner using GitHub Actions or equivalent logged evidence.
- [x] P0 / Done — verify `bun run build` in clean environment where required Bun compile targets are already available or downloadable. 2026-05-08: passed with `PATH="$HOME/.bun/bin:/usr/bin:/bin"`; sandboxed network initially failed target download, escalated network succeeded.
- [x] P0 / Done — inspect every `dist/agentctl-*.tar.gz` archive and verify exact expected file list. Release build now enforces the exact archive payload before succeeding; CI checks all archives, not only Linux.
- [x] P0 / Done — verify `SHA256SUMS` entries match archive names and checksums before install. Release build verifies the manifest after writing it; CI runs `sha256sum -c` inside `dist`.
- [x] P1 / Done — document build environment prerequisites: Bun version, `tar`, network access for compile targets, supported OS/arch. Covered in `docs/platforms.md`.
- [x] P1 / Done — verify failed build cleanup behavior and ensure release artifacts are not published from partial `dist`. Release build removes staging, partial archives and `SHA256SUMS` on failure; regression coverage is in `src/release/build-artifacts.test.ts`.
- [ ] P1 / Blocked — verify `package.json` version, CLI `.version("0.1.0")`, changelog and release tag strategy converge before `v1.0.0`. Current project surfaces still intentionally describe the first public beta; final `v1.0.0` version bump/tag remains a release-gate task.
- [x] P0 / Done — изменить `release.yml`: smoke должен проходить до публикации релиза. Workflow creates a draft release first, runs `release-smoke` against draft assets on Linux and macOS, then promotes with `gh release edit --draft=false` only after smoke passes.
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
# Локальная сборка (sanity check):
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install
# Release/public install path — обязательно для go/no-go:
AGENTCTL_VERSION=v1.0.0 rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install:public
```

## Release impact

Эта фаза является P0 для first public release artifacts. Local Linux artifact generation, checksum verification, archive inspection and install smoke are now reproducible. `v1.0.0` tag remains blocked until the repository is public, the public `main` installer URL returns 200, macOS release smoke evidence exists, and final version/tag surfaces are intentionally updated.

## Dependencies / ordering

- Public repository readiness must complete before public install URL can be authoritative.
- Runtime and security gates should complete before artifact validation.

## Open questions

- Как фиксировать evidence для macOS smoke: GitHub Actions run ID, local maintainer machine или оба.
- Должен ли `v1.0.0` tag использовать generated GitHub release notes или curated `docs/release-notes.md`.
- Какой exact Bun version policy действует для Production v1.0.0.
