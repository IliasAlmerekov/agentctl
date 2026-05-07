# Public Launch TODO

This checklist tracks the work required to move `agentctl` from a beta candidate to a public launch. The project already has a working daemon, hooks, CLI, TUI, SQLite state, checksum-based artifacts, tests, and docs. Public launch is blocked until the P0 items below are complete and verified from the real public install path.

## Launch Rule

Do not announce or direct users to the README install command until:

- [ ] The public GitHub repository serves `install.sh` from `main`.
- [ ] A tagged GitHub Release exists with all supported artifacts and `SHA256SUMS`.
- [ ] A fresh machine can install from the public README command without Bun already installed.
- [ ] The release smoke workflow proves Linux and macOS installs from the public release URL.

## P0 - Public Install And Release Blockers

### 1. Make the public install URL real

Current risk: the README install command points to `https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh`, but the public URL must be reachable before launch.

- [ ] Push/merge the launch-ready branch to `main`.
- [ ] Confirm `https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh` returns `200`.
- [ ] Confirm `README.md` install instructions match the actual default branch.
- [x] Add a CI or scripted check that fails if the README install URL returns non-200.

Acceptance:

```bash
rtk proxy curl -I -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh
```

### 2. Publish real GitHub Releases

Current risk: local build artifacts exist, but public install depends on GitHub Releases containing every platform artifact plus `SHA256SUMS`.

- [x] Add a tag-driven release workflow.
- [x] Build release artifacts in CI, not on a local workstation.
- [x] Upload these files for every release:
  - `agentctl-darwin-arm64`
  - `agentctl-daemon-darwin-arm64`
  - `pre-tool-use-darwin-arm64`
  - `post-tool-use-darwin-arm64`
  - `subagent-start-darwin-arm64`
  - `subagent-stop-darwin-arm64`
  - `agentctl-darwin-x64`
  - `agentctl-daemon-darwin-x64`
  - `pre-tool-use-darwin-x64`
  - `post-tool-use-darwin-x64`
  - `subagent-start-darwin-x64`
  - `subagent-stop-darwin-x64`
  - `agentctl-linux-x64`
  - `agentctl-daemon-linux-x64`
  - `pre-tool-use-linux-x64`
  - `post-tool-use-linux-x64`
  - `subagent-start-linux-x64`
  - `subagent-stop-linux-x64`
  - `SHA256SUMS`
- [x] Ensure release workflow has only the permissions it needs, including `contents: write` for publishing.
- [ ] Create the first beta tag, for example `v0.1.0-beta.1`.
- [ ] Verify `AGENTCTL_VERSION=v0.1.0-beta.1` install works.

Acceptance:

```bash
rtk git ls-remote --tags origin
rtk proxy curl -fsSL https://api.github.com/repos/IliasAlmerekov/agentctl/releases
```

### 3. Remove Bun from the end-user install path

Current risk: release binaries are compiled, but `install.sh` currently calls `bun -e` while patching `~/.claude/settings.json`. A clean machine without Bun fails during install.

- [x] Replace the installer `bun -e` settings patch with a runtime available on supported machines, or move settings patching into the compiled `agentctl` binary.
- [x] Add an installer preflight that fails before mutating files if a required runtime is missing.
- [x] Prefer no Bun requirement for installed users.
- [x] Update `docs/troubleshooting.md` so Bun is clearly development-only unless a deliberate product decision says otherwise.
- [x] Add a regression test that runs install with `PATH=/usr/bin:/bin`.

Acceptance:

```bash
rtk proxy bash -lc 'tmp="$(mktemp -d)"; HOME="$tmp" PATH="/usr/bin:/bin" AGENTCTL_BASE_URL="file://$PWD/dist" AGENTCTL_SKIP_DAEMON_REGISTRATION=1 bash install.sh; rc=$?; rm -rf "$tmp"; exit $rc'
```

### 4. Smoke test the real release URL

Current risk: local `file://dist` smoke passes, but public users install from GitHub Releases.

- [ ] Add a smoke path that installs from `https://github.com/IliasAlmerekov/agentctl/releases/...`.
- [ ] Run the smoke test on `ubuntu-latest`.
- [ ] Run the smoke test on `macos-latest`.
- [ ] Verify `agentctl status` after daemon start.
- [ ] Verify `agentctl uninstall` removes hooks, daemon registration, and `~/.agentctl`.

Acceptance:

```bash
AGENTCTL_VERSION=v0.1.0-beta.1 rtk proxy bash -lc 'curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash'
```

## P1 - Honest Runtime Semantics

### 5. Make `inject` and `cap` honest for unknown sessions

Current risk: `kill` reports `not_found`, but `inject` and `cap` can look successful for a mistyped or unknown session.

- [ ] Decide the product contract for unknown sessions:
  - Option A: return `not_found` and exit non-zero.
  - Option B: explicitly support queued future injections and document that behavior.
- [ ] Apply the same honesty rule to `inject` and `cap`.
- [ ] Add daemon HTTP tests for unknown-session `inject` and `cap`.
- [ ] Add CLI rendering tests for the selected behavior.
- [ ] Update README and troubleshooting if behavior changes.

Acceptance:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test src/daemon/http.test.ts src/cli/commands/inject.test.ts src/cli/commands/cap.test.ts
```

### 6. Reconcile hook latency claim with measured behavior

Current risk: docs say hook scripts are `< 150ms`, but measured normal p95 is currently around 180-196ms on local Linux.

- [ ] Decide whether the launch contract is `<150ms`, `<250ms`, or best-effort fail-open.
- [ ] If keeping `<150ms`, optimize compiled hook startup or daemon request path until p95 passes.
- [ ] If changing the contract, update README, AGENTCTL docs, comments, and latency tests.
- [ ] Keep daemon-unavailable path fast and fail-open.
- [ ] Store fresh latency evidence in docs or release notes.

Acceptance:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" AGENTCTL_HOOK_LATENCY_RUNS=10 bun run measure:hooks
```

### 7. Reduce release download weight

Current risk: each platform currently downloads six compiled Bun binaries. Linux x64 is roughly 585 MB total, macOS arm64 roughly 363 MB total, and macOS x64 roughly 393 MB total.

- [ ] Package per-platform assets into one archive, or reduce the number of compiled binaries.
- [ ] Consider one `agentctl` binary with subcommands for hook dispatch.
- [ ] Keep checksum verification for the final downloadable artifact.
- [ ] Update `install.sh`, `SHA256SUMS`, docs, and release tests.
- [ ] Set an explicit size budget for first public release.

Acceptance:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun run build
rtk proxy du -ch dist/*linux* dist/SHA256SUMS
```

## P1 - Release Quality And Recovery

### 8. Add upgrade/reinstall coverage

- [ ] Test install over an existing install with the same token.
- [ ] Test install over stale hook paths.
- [ ] Test install over an existing daemon registration.
- [ ] Test upgrade preserves `~/.agentctl/auth-token`.
- [ ] Test upgrade does not duplicate hook entries.
- [ ] Document the supported upgrade path.

Acceptance:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test src/release/install-script.test.ts src/cli/commands/uninstall.test.ts
```

### 9. Harden daemon startup errors

- [ ] Add a clear error when `~/.agentctl/auth-token` is missing or empty.
- [ ] Add a clear error when port `127.0.0.1:47823` is already in use.
- [ ] Document recovery for port conflicts.
- [ ] Ensure launchd/systemd logs show actionable startup failures.
- [ ] Keep hooks fail-open when the daemon is down.

Acceptance:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test src/daemon src/hooks
```

### 10. Verify uninstall on every supported platform path

- [ ] Linux systemd user service removal is covered.
- [ ] macOS launchd plist unload/removal is covered.
- [ ] pm2 fallback behavior is documented or tested.
- [ ] Uninstall removes only agentctl-managed Claude hooks.
- [ ] Uninstall leaves unrelated hooks untouched.

Acceptance:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test src/cli/commands/uninstall.test.ts
rtk env PATH="$HOME/.bun/bin:$PATH" bun run smoke:install
```

## P2 - Public Documentation And Positioning

### 11. Sync public docs after release workflow lands

- [ ] README install command works exactly as written.
- [ ] README explains beta status and supported platforms.
- [ ] README links release notes or changelog.
- [ ] `docs/platforms.md` matches release artifacts.
- [ ] `docs/security.md` does not overclaim same-user protection.
- [ ] `docs/troubleshooting.md` covers no-Bun install, daemon startup, auth token, port conflict, stale DB, and hook conflicts.
- [ ] `docs/hook-contract.md` matches measured hook behavior.

Acceptance:

```bash
rtk grep "TODO\\|not implemented\\|placeholder\\|your-org\\|OWNER/REPO" README.md ROADMAP.md TODO.md install.sh docs src .github
rtk env PATH="$HOME/.bun/bin:$PATH" bun test src/release
```

### 12. Add launch release notes

- [ ] State exactly what works: `agents`, `watch`, `status`, `inject`, `cap`, `kill`, `uninstall`.
- [ ] State supported platforms.
- [ ] State explicit limitations:
  - local single-user only
  - no Windows
  - no Linux arm64
  - no remote daemon
  - no Web UI
  - not a sandbox against same-user code
  - hooks fail open when agentctl is unavailable
- [ ] Include recovery links.
- [ ] Include checksum verification note.

Acceptance:

```bash
rtk read README.md
rtk read docs/out-of-scope.md
rtk read docs/security.md
```

## Final Public Launch Gate

Before public announcement, all commands below must pass from a clean checkout:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun install --frozen-lockfile
rtk env PATH="$HOME/.bun/bin:$PATH" bun test
rtk env PATH="$HOME/.bun/bin:$PATH" bun run typecheck
rtk env PATH="$HOME/.bun/bin:$PATH" bun run build
rtk env PATH="$HOME/.bun/bin:$PATH" bun audit
rtk env PATH="$HOME/.bun/bin:$PATH" bun run smoke:install
rtk env PATH="$HOME/.bun/bin:$PATH" AGENTCTL_HOOK_LATENCY_RUNS=10 bun run measure:hooks
```

Public release smoke must also pass from the real URL:

```bash
AGENTCTL_VERSION=v0.1.0-beta.1 rtk proxy bash -lc 'curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash'
```

## Definition Of Done

- [ ] README install command works for real users.
- [ ] Release artifacts are produced and published by CI.
- [ ] Installer does not require Bun for installed-user flow.
- [ ] Checksums are verified before binaries are installed.
- [ ] Unknown-agent control commands behave honestly.
- [ ] Hook latency claim matches measured behavior.
- [ ] Download size is acceptable for a CLI tool.
- [ ] Linux and macOS release smoke tests pass.
- [ ] Public docs describe only implemented and verified behavior.
- [ ] A signed-off release tag exists.
