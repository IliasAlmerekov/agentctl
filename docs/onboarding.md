# User Onboarding

This is the external-user path for the first public beta. It assumes a supported
platform and a GitHub Release with the matching archive already exists.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash
```

Pin a release when you do not want `latest`:

```bash
curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | AGENTCTL_VERSION=v0.1.0-beta.1 bash
```

After install, restart the shell or source the rc file updated by the installer,
then verify the daemon:

```bash
agentctl status
```

Expected healthy output includes:

```text
daemon: ok
```

## Supported artifacts

The installer detects the local platform and downloads one release archive plus
`SHA256SUMS`:

- `agentctl-darwin-arm64.tar.gz`
- `agentctl-darwin-x64.tar.gz`
- `agentctl-linux-x64.tar.gz`

The archive contains the CLI, daemon, and four hook binaries. `install.sh`
verifies `SHA256SUMS` before replacing installed binaries.

## First commands

```bash
agentctl agents
agentctl watch
agentctl inject <session-id> "Use the simpler implementation path."
agentctl cap <session-id> --tokens 50000
agentctl kill <session-id>
agentctl uninstall
```

`agentctl agents` shows known sessions and token usage. `agentctl watch` opens
the live TUI. `inject`, `cap`, and `kill` require a session id from
`agentctl agents`; unknown ids return `not_found`.

## Managed hook setup

The installer patches `~/.claude/settings.json` with agentctl-managed hook
commands pointing at:

- `~/.agentctl/bin/hooks/pre-tool-use`
- `~/.agentctl/bin/hooks/post-tool-use`
- `~/.agentctl/bin/hooks/subagent-start`
- `~/.agentctl/bin/hooks/subagent-stop`

The CLI also has an `install-hooks` command. It is an internal installer command
used by `install.sh` to patch Claude settings non-destructively. It is not part
of the normal user command reference.

Hook behavior is intentionally fail open: if the daemon is unavailable, auth
fails, input is malformed, or a hook cannot parse the daemon response, Claude
Code should continue instead of being blocked by agentctl. The exact blocking
contract is in `docs/hook-contract.md`.

## Recovery map

- Missing or empty auth token: re-run the installer; it recreates or repairs
  `~/.agentctl/auth-token`.
- Port conflict: if `127.0.0.1:47823` is already in use, stop the old
  `agentctl-daemon` process or free the port, then restart the daemon.
- Daemon unavailable: inspect `~/.agentctl/daemon.log` and
  `~/.agentctl/daemon.error.log`, then restart launchd, `systemd --user`, pm2,
  or the daemon binary directly.
- Stale DB: use `agentctl agents` to identify historical sessions; move
  `~/.agentctl/agents.db` aside only when local runtime history can be
  discarded.
- PATH: make sure `~/.agentctl/bin` is in the shell path, then run
  `agentctl status`.
- Hook config conflicts: inspect `~/.claude/settings.json`, re-run the
  installer to repair agentctl hook entries, or run `agentctl uninstall` to
  remove only agentctl-managed hooks and local files.

Full recovery details are in `docs/troubleshooting.md`.

## Known limitations

- no Windows
- no Linux arm64
- no remote daemon
- no Web UI
- not a sandbox against code already running as the same user
- hooks fail open when agentctl is unavailable

See `docs/platforms.md`, `docs/security.md`, and `docs/out-of-scope.md` for the
full support and limitation model.
