# v1 Test Strategy

This document is the durable verification map for the Production v1.0.0 gate.
It defines the commands, automated coverage, manual checks, and release blockers
that must be reviewed before tagging v1.

## Mandatory local pre-release commands

Run these commands from the repository root with the release PATH:

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun install --frozen-lockfile
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun test
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run typecheck
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run build
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run measure:hooks
```

Expected outcomes:

- `bun install --frozen-lockfile`: exits 0 and does not modify lockfiles.
- `bun test`: exits 0 with no failing tests.
- `bun run typecheck`: exits 0.
- `bun run build`: creates exactly three release archives plus `SHA256SUMS`.
- `bun run check:public-doc-drift`: exits 0 before public launch.
- `bun run check:public-install-url`: exits 0 only after the repository is public
  and the `main` branch installer URL is reachable.
- `bun run smoke:install`: exits 0 on Linux x64 local release artifacts.
- `bun run measure:hooks`: exits 0 and keeps p95 within the documented budget.

## Verification ownership

| Area | Owner | Evidence |
| --- | --- | --- |
| WebSocket reconnect/disconnect | Automated | `src/cli/commands/watch.test.ts` covers `reconnectDelay`; `src/daemon/http.test.ts` covers WebSocket auth/upgrade. |
| Malformed daemon JSON | Automated | `src/daemon/http.test.ts` covers malformed JSON, missing `Content-Length`, and oversized bodies. |
| Invalid CLI input | Automated | `src/cli/commands/inject.test.ts` and `src/cli/commands/cap.test.ts` cover empty, oversized, non-integer, zero, negative, fractional, and malformed inputs. |
| Storage migration compatibility | Automated | `src/daemon/db.test.ts` covers schema v1, missing schema metadata, unsupported future schema, malformed schema metadata, retention, and startup reconciliation. |
| DB failure behavior | Documented plus automated | `docs/storage.md` defines fail-open hooks and fail-closed CLI/daemon behavior; `src/hooks/daemon-client.test.ts` covers hook fail-open. |
| TUI non-TTY behavior | Automated plus manual | `src/cli/commands/watch.test.ts` covers `watchGuard`; manual checks below cover terminal behavior. |
| Release archive contents | Automated | `src/release/build-artifacts.test.ts` verifies exact archive entries and cleanup of partial artifacts. |
| Checksum manifest | Automated | `src/release/build-artifacts.test.ts` verifies manifest names and hashes; `src/release/ci-workflow.test.ts` ensures CI runs checksum and archive checks. |
| Public install URL | External gate | `scripts/check-public-install-url.ts` verifies the public `main` installer URL after the repository is public. |
| macOS release smoke | CI/manual gate | `.github/workflows/install-smoke.yml` and `.github/workflows/release.yml` define macOS smoke; final evidence must be a GitHub Actions run or maintainer machine log. |

## Manual TUI checklist

Record the date, platform, commit, and terminal app for each manual run.

- non-TTY: `rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run src/cli/index.ts watch < /dev/null` exits non-zero with `agentctl watch requires a TTY`.
- terminal resize: start the daemon and `agentctl watch`, resize the terminal smaller and larger, and confirm the Ink layout keeps rendering without a crash.
- `q` exits: in an interactive TTY, press `q` and confirm the process exits with code 0.
- daemon disconnect: stop the daemon while `agentctl watch` is open and confirm the TUI shows `daemon disconnected — reconnecting...`; restart the daemon and confirm updates resume.
- macOS release smoke: run the install smoke workflow or `rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run smoke:install` on a supported macOS runner before publishing a release.

## Lint policy

The repository has no `lint` script today, and no `lint` script is required for v1.0.0. Static verification for v1 is `bun run typecheck` plus the existing Bun test suite. Adding a lint gate later is acceptable, but it must not become an implicit v1 release blocker without an explicit roadmap update.

## Test taxonomy

| Class | Files | Gate |
| --- | --- | --- |
| Unit | `src/cli/commands/*.test.ts`, `src/daemon/kill.test.ts`, pure helper tests | `bun test` |
| Integration | `src/daemon/http.test.ts`, `src/daemon/db.test.ts`, `src/daemon/startup.test.ts`, `src/hooks/daemon-client.test.ts` | `bun test` |
| Release | `src/release/build-artifacts.test.ts`, `src/release/install-script.test.ts`, `src/release/install-smoke.test.ts`, `src/release/ci-workflow.test.ts`, `src/release/release-workflow.test.ts` | `bun test`, `bun run build`, `bun run smoke:install` |
| Docs | `src/release/*doc*.test.ts`, `src/release/test-strategy-doc.test.ts`, `scripts/check-public-doc-drift.ts` | `bun test`, `bun run check:public-doc-drift` |

## CI expectations

CI must cover dependency install, test, typecheck, release build, checksum
verification, and archive composition. The public URL check is allowed to be
conditional until the repository is public. The release workflow must publish a
draft first, run smoke against draft assets, and promote only after all smoke
matrix jobs pass.
