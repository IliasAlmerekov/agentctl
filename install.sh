#!/usr/bin/env bash
set -euo pipefail

AGENTCTL_HOME="$HOME/.agentctl"
BIN_DIR="$AGENTCTL_HOME/bin"
HOOKS_DIR="$BIN_DIR/hooks"
AUTH_TOKEN_FILE="$AGENTCTL_HOME/auth-token"
CHECKSUMS_FILE="$AGENTCTL_HOME/SHA256SUMS"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
REPO="IliasAlmerekov/agentctl"

# ─── 1. Detect platform ───────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Darwin-arm64)  PLATFORM="darwin-arm64" ;;
  Darwin-x86_64) PLATFORM="darwin-x64" ;;
  Linux-x86_64)  PLATFORM="linux-x64" ;;
  *)
    echo "Unsupported platform: $OS-$ARCH"
    exit 1
    ;;
esac

# ─── 2. Download binaries ─────────────────────────────────────────────────────
VERSION="${AGENTCTL_VERSION:-latest}"
BASE_URL="https://github.com/$REPO/releases/${VERSION}/download"

mkdir -p "$HOOKS_DIR"

generate_auth_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

sha256_file() {
  local file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
    return
  fi

  echo "Neither sha256sum nor shasum is available for checksum verification" >&2
  exit 1
}

expected_checksum() {
  local artifact="$1"
  awk -v name="$artifact" '$2 == name { print $1; exit }' "$CHECKSUMS_FILE"
}

verify_checksum() {
  local artifact="$1"
  local file="$2"
  local expected
  local actual

  expected="$(expected_checksum "$artifact")"
  if [[ -z "$expected" ]]; then
    echo "Missing checksum for $artifact in $CHECKSUMS_FILE" >&2
    exit 1
  fi

  actual="$(sha256_file "$file")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum mismatch for $artifact" >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    exit 1
  fi
}

verify_downloads() {
  verify_checksum "agentctl-$PLATFORM" "$BIN_DIR/agentctl"
  verify_checksum "agentctl-daemon-$PLATFORM" "$BIN_DIR/agentctl-daemon"
  verify_checksum "pre-tool-use-$PLATFORM" "$HOOKS_DIR/pre-tool-use"
  verify_checksum "post-tool-use-$PLATFORM" "$HOOKS_DIR/post-tool-use"
  verify_checksum "subagent-start-$PLATFORM" "$HOOKS_DIR/subagent-start"
  verify_checksum "subagent-stop-$PLATFORM" "$HOOKS_DIR/subagent-stop"
}

if [[ ! -f "$AUTH_TOKEN_FILE" ]]; then
  umask 077
  generate_auth_token > "$AUTH_TOKEN_FILE"
  chmod 600 "$AUTH_TOKEN_FILE"
  echo "Generated local auth token at $AUTH_TOKEN_FILE"
else
  chmod 600 "$AUTH_TOKEN_FILE"
fi

echo "Downloading agentctl $VERSION for $PLATFORM..."

curl -fsSL "$BASE_URL/SHA256SUMS" -o "$CHECKSUMS_FILE"
curl -fsSL "$BASE_URL/agentctl-$PLATFORM" -o "$BIN_DIR/agentctl"
curl -fsSL "$BASE_URL/agentctl-daemon-$PLATFORM" -o "$BIN_DIR/agentctl-daemon"
curl -fsSL "$BASE_URL/pre-tool-use-$PLATFORM" -o "$HOOKS_DIR/pre-tool-use"
curl -fsSL "$BASE_URL/post-tool-use-$PLATFORM" -o "$HOOKS_DIR/post-tool-use"
curl -fsSL "$BASE_URL/subagent-start-$PLATFORM" -o "$HOOKS_DIR/subagent-start"
curl -fsSL "$BASE_URL/subagent-stop-$PLATFORM" -o "$HOOKS_DIR/subagent-stop"

verify_downloads

chmod +x "$BIN_DIR/agentctl" "$BIN_DIR/agentctl-daemon" \
         "$HOOKS_DIR/pre-tool-use" "$HOOKS_DIR/post-tool-use" \
         "$HOOKS_DIR/subagent-start" "$HOOKS_DIR/subagent-stop"

# ─── 3. Add to PATH ───────────────────────────────────────────────────────────
PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""

for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [[ -f "$rc" ]] && ! grep -qF "$BIN_DIR" "$rc"; then
    echo "" >> "$rc"
    echo "# agentctl" >> "$rc"
    echo "$PATH_LINE" >> "$rc"
    echo "Added PATH entry to $rc"
  fi
done

# ─── 4. Patch ~/.claude/settings.json ─────────────────────────────────────────
mkdir -p "$(dirname "$CLAUDE_SETTINGS")"

if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
  echo '{}' > "$CLAUDE_SETTINGS"
fi

# Use node/bun to do a non-destructive merge of hooks
bun -e "
const fs = require('fs');
const path = '$CLAUDE_SETTINGS';
const settings = JSON.parse(fs.readFileSync(path, 'utf8'));
settings.hooks ??= {};

const hookCmd = (name) => ({
  type: 'command',
  command: '$HOOKS_DIR/' + name
});

settings.hooks.PreToolUse ??= [];
settings.hooks.PostToolUse ??= [];
settings.hooks.SubagentStart ??= [];
settings.hooks.SubagentStop ??= [];

const ensureHook = (arr, name) => {
  const cmd = '$HOOKS_DIR/' + name;
  if (!arr.some(h => h.hooks?.some(hh => hh.command === cmd))) {
    arr.push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
  }
};

ensureHook(settings.hooks.PreToolUse, 'pre-tool-use');
ensureHook(settings.hooks.PostToolUse, 'post-tool-use');
ensureHook(settings.hooks.SubagentStart, 'subagent-start');
ensureHook(settings.hooks.SubagentStop, 'subagent-stop');

fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
console.log('Patched ~/.claude/settings.json');
"

# ─── 5. Register daemon as background process ─────────────────────────────────
if [[ "$OS" == "Darwin" ]]; then
  PLIST="$AGENTCTL_HOME/agentctl-daemon.plist"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentctl.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_DIR/agentctl-daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$AGENTCTL_HOME/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>$AGENTCTL_HOME/daemon.error.log</string>
</dict>
</plist>
PLIST

  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "Daemon registered with launchd"

elif command -v systemctl &>/dev/null && systemctl --user status &>/dev/null 2>&1; then
  SERVICE_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SERVICE_DIR"

  cat > "$SERVICE_DIR/agentctl-daemon.service" <<SERVICE
[Unit]
Description=agentctl daemon
After=network.target

[Service]
ExecStart=$BIN_DIR/agentctl-daemon
Restart=always
RestartSec=3
StandardOutput=append:$AGENTCTL_HOME/daemon.log
StandardError=append:$AGENTCTL_HOME/daemon.error.log

[Install]
WantedBy=default.target
SERVICE

  systemctl --user daemon-reload
  systemctl --user enable --now agentctl-daemon
  echo "Daemon registered with systemd --user"

elif command -v pm2 &>/dev/null; then
  pm2 start "$BIN_DIR/agentctl-daemon" --name agentctl-daemon
  pm2 save
  echo "Daemon registered with pm2"

else
  echo "Could not register daemon automatically."
  echo "Run manually: $BIN_DIR/agentctl-daemon &"
fi

echo ""
echo "agentctl installed. Restart your shell or run:"
echo "  source ~/.zshrc  (or ~/.bashrc)"
echo ""
echo "Then: agentctl status"
