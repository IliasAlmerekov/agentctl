# agentctl Production Readiness Roadmap

This roadmap starts after the MVP checklist. The goal is to move agentctl from a working local demo to a trustworthy beta/release candidate without expanding the product surface beyond the three core controls: inject, cap, and kill.

## Current Baseline

- Daemon, hooks, SQLite storage, CLI commands, TUI, and compiled binaries exist.
- `bun test` currently passes, but coverage is narrow.
- `bun run typecheck` passes.
- `bun run build` succeeds when Bun is available on `PATH`.
- The daemon can start and answer `agentctl status`.

Known production gaps:

- Installer and README still reference the placeholder repository `you/agentctl`.
- Documentation promises some behavior that is not implemented yet, such as uninstall.

## Release Bar

agentctl is production-ready when all of the following are true:

- Core control semantics are honest and tested: inject steers, cap blocks at budget, kill blocks the target agent only.
- Local daemon control is protected against accidental or unauthorized localhost callers.
- Install, upgrade, uninstall, and repair paths are reproducible on supported platforms.
- Daemon restarts do not leave stale sessions in misleading active states.
- Release artifacts are built by CI, checksummed, and verified before publishing.
- Public docs describe only implemented and verified behavior.

## Phase 1: Control Semantics

Priority: P0

Goal: make the three advertised commands behave exactly as described.

Tasks:

- [x] Add a killed-agent gate in `src/daemon/handlers/pre-tool.ts`.
- [x] Make `agentctl kill <session-id>` idempotent and explicit when the session does not exist.
- [x] Decide whether killing an unknown agent should fail closed or return a clear CLI error. Decision: return a clear CLI error for unknown sessions.
- [x] Add tests for killed-agent blocking.
- [x] Add tests for injection delivery and one-time delivery.
- [x] Add tests for budget cap behavior before and after the threshold.
- [x] Add integration coverage for `inject`, `cap`, `kill`, `agents`, and `status`.

Verification:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test
rtk env PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

Exit criteria:

- A killed session receives a blocking pre-tool decision.
- Other sessions continue to receive normal decisions.
- All three core controls have focused regression tests.

## Phase 2: Local Daemon Security

Priority: P0

Goal: prevent arbitrary local processes from controlling agentctl by posting to the daemon port.

Tasks:

- [x] Add a local auth token generated during install and stored under `~/.agentctl`.
- [x] Require the token on CLI endpoints: `/inject`, `/cap`, `/kill`, `/agents`, `/status`, and WebSocket access.
- [x] Decide whether hook endpoints also require auth or use a separate hook token. Decision: hook endpoints require the same local auth token; no separate hook token for the single-user local model.
- [x] Bind explicitly to loopback and document the threat model.
- [x] Add tests for missing, invalid, and valid auth.
- [x] Ensure auth failures never produce confusing hook behavior.

Verification:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test
rtk env PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

Exit criteria:

- Unauthenticated local HTTP requests cannot inject, cap, kill, list, or watch agents.
- The supported local security model is documented.

## Phase 3: Lifecycle And Persistence

Priority: P1

Goal: make daemon restarts, stale sessions, and old SQLite state predictable.

Tasks:

- [x] Add a startup reconciliation step for previously `running` sessions.
- [x] Track daemon boot id or heartbeat timestamps.
- [x] Mark sessions stale when the daemon cannot prove they are still active.
- [x] Add retention cleanup for old `tool_calls` and delivered injections.
- [x] Add database migration/version metadata.
- [x] Add tests around restart reconciliation and stale-state display.

Verification:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test
rtk env PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

Exit criteria:

- Restarting the daemon does not report old sessions as actively running.
- SQLite state remains readable across schema changes.

## Phase 4: Installer And Release Pipeline

Priority: P1

Goal: make installation and release reproducible for real users.

Tasks:

- [ ] Replace `you/agentctl` with the real repository owner/name.
- [ ] Build artifacts for `darwin-arm64`, `darwin-x64`, and `linux-x64`.
- [ ] Publish checksums for all release artifacts.
- [ ] Verify checksums in `install.sh` before chmod/install.
- [ ] Add `agentctl uninstall` or remove the docs promise.
- [ ] Add install repair mode for existing hook entries.
- [ ] Add installer dry-run tests where practical.
- [ ] Add CI workflow for test, typecheck, build, and release artifact smoke tests.

Verification:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test
rtk env PATH="$HOME/.bun/bin:$PATH" bun run typecheck
rtk env PATH="$HOME/.bun/bin:$PATH" bun run build
```

Exit criteria:

- A clean machine can install, run `agentctl status`, and uninstall without manual edits.
- Release artifacts come from CI, not a local workstation.

## Phase 5: Hook Contract Hardening

Priority: P1

Goal: keep Claude Code hook behavior safe, fast, and explicit.

Tasks:

- [ ] Validate hook stdin JSON before sending it to the daemon.
- [ ] Keep hook failure mode fail-open for daemon/network failures.
- [ ] Decide whether malformed hook input should fail-open or emit a safe diagnostic.
- [ ] Measure compiled hook latency under normal and daemon-unavailable paths.
- [ ] Add manual hook fixtures for `PreToolUse`, `PostToolUse`, `SubagentStart`, and `SubagentStop`.
- [ ] Document the `exit(2)` blocking contract and its limitations.

Verification:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun test
rtk env PATH="$HOME/.bun/bin:$PATH" bun run build
```

Exit criteria:

- Hook scripts remain fast and fail-open when agentctl is down.
- Blocking behavior is covered by automated or scripted manual verification.

## Phase 6: Documentation And Public Positioning

Priority: P2

Goal: make public docs accurate enough for a first beta.

Tasks:

- [ ] Sync README install instructions with the real release pipeline.
- [ ] Remove or clearly label unimplemented commands.
- [ ] Document supported platforms and unsupported platforms.
- [ ] Add troubleshooting for daemon not running, Bun/PATH issues, stale DB state, and hook config conflicts.
- [ ] Add a short security note explaining local daemon access and limits.
- [ ] Keep MVP out-of-scope items explicit: Windows, remote daemon, Web UI, per-tool-type budgets, external observability.

Verification:

```bash
rtk rg -n "you/agentctl|uninstall|TODO|later|not implemented" README.md AGENTCTL.md ROADMAP.md install.sh src
rtk env PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

Exit criteria:

- A user can understand what agentctl does, what it does not do, how to install it, and how to recover from common failures.
- Docs do not overclaim production guarantees.

## Beta Gate

Before tagging a beta release:

- [ ] `inject`, `cap`, and `kill` are covered by tests.
- [ ] Local daemon auth is implemented and documented.
- [ ] Restart reconciliation is implemented.
- [ ] Installer uses the real repository and verifies release artifacts.
- [ ] CI builds all supported binaries.
- [ ] README and AGENTCTL docs match actual behavior.
- [ ] A fresh install smoke test has been run on at least one supported macOS target and one supported Linux target.

## Later, Not For Production Gate

These are useful but should not block the first production-ready beta:

- Windows packaging.
- Web UI.
- Remote daemon or multi-machine control.
- Per-tool-type budget caps.
- OpenTelemetry or external dashboard integrations.
- Native integration with future Claude Code agent-control APIs.
