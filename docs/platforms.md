# Platform Support

agentctl release artifacts are built from the release manifest in `src/release/build-artifacts.ts`. The installer maps the local `uname` result to one of these artifact suffixes and exits with `Unsupported platform` for anything else.

## Supported platforms

| Platform | Installer detection | Bun compile target | Release artifact suffix |
| --- | --- | --- | --- |
| macOS Apple Silicon | `Darwin-arm64` | `bun-darwin-arm64` | `darwin-arm64` |
| macOS Intel | `Darwin-x86_64` | `bun-darwin-x64` | `darwin-x64` |
| Linux x64 | `Linux-x86_64` | `bun-linux-x64` | `linux-x64` |

Each supported platform must publish these release artifacts plus `SHA256SUMS`:

- `agentctl-$platform`
- `agentctl-daemon-$platform`
- `pre-tool-use-$platform`
- `post-tool-use-$platform`
- `subagent-start-$platform`
- `subagent-stop-$platform`

## Unsupported platforms

- Windows packaging is not supported.
- Linux arm64 is not supported.
- macOS architectures other than arm64 and x64 are not supported.
- remote daemon usage is not supported; agentctl is a local single-user daemon.
- Other Unix variants, containers, Alpine/musl environments, and package managers are not supported by the installer unless they match the Linux x64 release artifact and required runtime behavior.

On unsupported OS/architecture combinations, `install.sh` prints `Unsupported platform: <OS>-<ARCH>` and exits before downloading artifacts.
