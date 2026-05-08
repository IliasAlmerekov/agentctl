# Platform Support

agentctl release archives are built from the release manifest in `src/release/build-artifacts.ts`. The installer maps the local `uname` result to one of these platform suffixes and exits with `Unsupported platform` for anything else.

## Supported platforms

| Platform | Installer detection | Bun compile target | Release archive |
| --- | --- | --- | --- |
| macOS Apple Silicon | `Darwin-arm64` | `bun-darwin-arm64` | `agentctl-darwin-arm64.tar.gz` |
| macOS Intel | `Darwin-x86_64` | `bun-darwin-x64` | `agentctl-darwin-x64.tar.gz` |
| Linux x64 | `Linux-x86_64` | `bun-linux-x64` | `agentctl-linux-x64.tar.gz` |

Each supported platform must publish one release archive plus `SHA256SUMS`. The archive contains:

- `agentctl`
- `agentctl-daemon`
- `hooks/pre-tool-use`
- `hooks/post-tool-use`
- `hooks/subagent-start`
- `hooks/subagent-stop`

## Release build prerequisites

Release artifact generation is reproducible only when the build environment has
the required tooling available before `bun run build` starts:

- Bun 1.3.13, matching the GitHub Actions release workflow.
- `tar`, used to create and inspect `agentctl-*.tar.gz` archives.
- network access for Bun compile targets, unless they are already present in
  the local Bun cache.
- `sha256sum` or `shasum`, used by the installer to verify downloaded release
  archives against `SHA256SUMS`.

If Bun cannot download a compile target, the build must fail without publishing
partial release archives. The release build cleans the staging directory,
removes partial `agentctl-*.tar.gz` files, and removes `SHA256SUMS` on failure.

## Unsupported platforms

- Windows packaging is not supported.
- Linux arm64 is not supported.
- macOS architectures other than arm64 and x64 are not supported.
- remote daemon usage is not supported; agentctl is a local single-user daemon.
- Other Unix variants, containers, Alpine/musl environments, and package managers are not supported by the installer unless they match the Linux x64 release artifact and required runtime behavior.

On unsupported OS/architecture combinations, `install.sh` prints `Unsupported platform: <OS>-<ARCH>` and exits before downloading artifacts.
