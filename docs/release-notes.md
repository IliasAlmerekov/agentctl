# 0.2.0 Public Beta Release Notes

These notes describe the `v0.2.0` public beta shape for agentctl.

## What Works

- `agentctl agents`: list recorded agents with status and token usage.
- `agentctl watch`: open the local TUI with agent tree, token bars, and loop alerts.
- `agentctl status`: show whether the local daemon is reachable.
- `agentctl inject`: send a steering message to a known running agent.
- `agentctl cap`: set a total token cap for a known running agent.
- `agentctl kill`: mark one known running agent as killed so the next tool call is blocked.
- `agentctl uninstall`: remove agentctl-managed hooks, daemon registration, and local files.

Unknown session IDs return `not_found` for `inject`, `cap`, and `kill`.

## Supported Platforms

The `v0.2.0` public beta publishes one archive plus `SHA256SUMS` for each
supported platform:

- macOS Apple Silicon: `agentctl-darwin-arm64.tar.gz`
- macOS Intel: `agentctl-darwin-x64.tar.gz`
- Linux x64: `agentctl-linux-x64.tar.gz`

The full platform matrix is in `docs/platforms.md`.

## Explicit Limitations

- local single-user only
- no Windows
- no Linux arm64
- no remote daemon
- no Web UI
- not a sandbox against same-user code
- hooks fail open when agentctl is unavailable

Security boundaries are documented in `docs/security.md`. Scope exclusions are
listed in `docs/out-of-scope.md`.

## Recovery Links

- Install, daemon, PATH, stale DB, and hook recovery: `docs/troubleshooting.md`
- Local daemon and auth-token limits: `docs/security.md`
- Platform support: `docs/platforms.md`
- Hook blocking and fail-open behavior: `docs/hook-contract.md`

## Checksum Verification

The installer downloads `SHA256SUMS` and the selected platform archive from the
GitHub Release. It verifies the archive checksum before extracting or replacing
installed binaries.
