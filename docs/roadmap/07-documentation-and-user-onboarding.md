# 07 Documentation And User Onboarding

## Goal

Сделать public documentation понятной для external users и точной относительно verified Production v1.0.0 behavior.

## Audit basis

- README содержит install, beta status, usage, architecture, local security model and development commands.
- `docs/platforms.md`, `docs/troubleshooting.md`, `docs/security.md`, `docs/hook-contract.md`, `docs/out-of-scope.md`, `docs/release-notes.md` существуют.
- `bun run check:public-doc-drift` прошел.
- Public install URL verification failed.
- README install path depends on public `main` and GitHub Release archives.
- Documentation accuracy was `PARTIAL` in audit because public install reachability was not verified and launch planning files remained tracked.

## Scope

- Installation documentation.
- Command reference.
- Hook setup documentation.
- Troubleshooting.
- Public user onboarding.
- Operational assumptions.
- Examples.
- Known limitations.

## Out of scope

- Marketing launch page.
- New demos beyond existing `docs/demo.gif`, unless required to keep docs accurate.
- Documentation for unsupported platforms.

## Work items

- [ ] P0 / Blocked — verify README install command works from public URL before marking docs production-ready. Blocked while the repository remains private.
- [ ] P0 / Blocked — update docs from beta language to Production v1.0.0 language only when release gates pass.
- [x] P1 / Done — ensure command reference covers `agents`, `watch`, `status`, `inject`, `cap`, `kill`, `uninstall` and hidden/internal `install-hooks` status. Covered in `README.md`, `AGENTCTL.md`, and `docs/onboarding.md`.
- [x] P1 / Done — ensure hook setup docs explain managed `~/.claude/settings.json` changes and fail-open behavior. Covered in `docs/onboarding.md` and `docs/hook-contract.md`.
- [x] P1 / Done — ensure troubleshooting covers missing auth token, empty token, port conflict, daemon unavailable, stale DB, PATH, hook config conflicts and uninstall. Covered in `docs/troubleshooting.md` and summarized in `docs/onboarding.md`.
- [x] P1 / Done — ensure examples use supported platform and artifact names. Covered in `docs/onboarding.md` and `docs/platforms.md`.
- [x] P1 / Done — keep known limitations aligned with v1 non-goals: no Windows, no Linux arm64, no remote daemon, no Web UI, no sandbox guarantee. Covered in `README.md`, `docs/onboarding.md`, `docs/security.md`, and `docs/out-of-scope.md`.
- [x] P2 / Done — verify `docs/demo.gif` and screenshots, if any, do not imply unsupported features. Only `docs/demo.gif` is referenced; no screenshot docs imply unsupported platforms or Web UI.

## Acceptance criteria

- A new external user can install, run `agentctl status`, understand hooks, recover common failures and uninstall using docs only.
- Public docs contain no unchecked launch planning state.
- Docs describe only implemented and verified behavior.
- `bun run check:public-doc-drift` passes after final docs update.

Status: local onboarding documentation is complete in `docs/onboarding.md`. Production-ready wording remains blocked until the public URL and v1 release gates pass.

## Verification commands

```bash
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-doc-drift
rtk env PATH="$HOME/.bun/bin:/usr/bin:/bin" bun run check:public-install-url
rtk rg -n "beta|preparing|Unreleased|not[ -]implemented|place[ -]?holder|OWNER[/]REPO|your[-]org" README.md CHANGELOG.md docs AGENTCTL.md ROADMAP.md -S
rtk rg -n "agentctl agents|agentctl watch|agentctl status|agentctl inject|agentctl cap|agentctl kill|agentctl uninstall" README.md docs AGENTCTL.md -S
```

## Release impact

Documentation gates public usability. Local onboarding, hook, troubleshooting and limitation docs are aligned. Production v1.0.0 remains blocked until the public installer URL and final release wording are verified.

## Dependencies / ordering

- Depends on Phase 01 public repository readiness.
- Depends on Phase 05 verified install and release artifacts.
- Final wording should be updated after Phase 08 go/no-go passes.

## Open questions

- Нужно ли сохранять `CHANGELOG.md` `Unreleased` section после `v1.0.0`.
- `install-hooks` is documented as an internal installer command in `docs/onboarding.md`, not as a normal user command.
