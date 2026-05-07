# Changelog

## Unreleased

agentctl is preparing its first public beta. No tagged public beta release has
been published from this branch yet.

Current documented release shape:

- Public installer: `curl -fsSL https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh | bash`
- Release archives: `agentctl-darwin-arm64.tar.gz`, `agentctl-darwin-x64.tar.gz`, and `agentctl-linux-x64.tar.gz`
- Checksum manifest: `SHA256SUMS`, verified before downloaded binaries are installed
- Installed-user runtime: compiled binaries only; Bun is development-only
- Recovery docs: `docs/troubleshooting.md`

The tagged beta entry is created when the first beta tag is cut.
