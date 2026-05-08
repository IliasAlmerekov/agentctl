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

# ─── 2. Download release archive ───────────────────────────────────────────────
VERSION="${AGENTCTL_VERSION:-latest}"
if [[ -n "${AGENTCTL_BASE_URL:-}" ]]; then
  BASE_URL="$AGENTCTL_BASE_URL"
elif [[ "$VERSION" == "latest" ]]; then
  BASE_URL="https://github.com/$REPO/releases/latest/download"
else
  BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
fi
ARCHIVE="agentctl-$PLATFORM.tar.gz"
DRY_RUN="${AGENTCTL_INSTALL_DRY_RUN:-0}"
SKIP_DAEMON_REGISTRATION="${AGENTCTL_SKIP_DAEMON_REGISTRATION:-0}"

is_dry_run() {
  [[ "$DRY_RUN" == "1" || "$DRY_RUN" == "true" || "$DRY_RUN" == "yes" ]]
}

should_skip_daemon_registration() {
  [[ "$SKIP_DAEMON_REGISTRATION" == "1" || "$SKIP_DAEMON_REGISTRATION" == "true" || "$SKIP_DAEMON_REGISTRATION" == "yes" ]]
}

preflight_requirements() {
  local missing=0

  if ! command -v curl >/dev/null 2>&1; then
    echo "Missing required command: curl" >&2
    missing=1
  fi

  if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
    echo "Missing required checksum command: sha256sum or shasum" >&2
    missing=1
  fi

  if ! command -v tar >/dev/null 2>&1; then
    echo "Missing required command: tar" >&2
    missing=1
  fi

  if ! command -v openssl >/dev/null 2>&1 && ! command -v od >/dev/null 2>&1; then
    echo "Missing required token entropy command: openssl or od" >&2
    missing=1
  fi

  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
}

if is_dry_run; then
  echo "Dry run: would install agentctl $VERSION for $PLATFORM"
  echo "Dry run: would create $HOOKS_DIR"
  echo "Dry run: would generate or reuse $AUTH_TOKEN_FILE"
  echo "Dry run: would download release artifacts from $BASE_URL"
  echo "Dry run: would verify checksums from $CHECKSUMS_FILE"
  echo "Dry run: would mark binaries executable under $BIN_DIR"
  echo "Dry run: would patch $CLAUDE_SETTINGS"
  echo "Dry run: would register daemon for $OS"
  exit 0
fi

preflight_requirements

mkdir -p "$HOOKS_DIR"
DOWNLOAD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agentctl-install.XXXXXX")"
CHECKSUMS_DOWNLOAD="$DOWNLOAD_DIR/SHA256SUMS"
PAYLOAD_DIR="$DOWNLOAD_DIR/payload"

cleanup_downloads() {
  rm -rf "$DOWNLOAD_DIR"
}

trap cleanup_downloads EXIT

staged_artifact_path() {
  local artifact="$1"
  echo "$DOWNLOAD_DIR/$artifact"
}

payload_path() {
  local path="$1"
  echo "$PAYLOAD_DIR/$path"
}

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
  awk -v name="$artifact" '$2 == name { print $1; exit }' "$CHECKSUMS_DOWNLOAD"
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
  verify_checksum "$ARCHIVE" "$(staged_artifact_path "$ARCHIVE")"
}

extract_downloads() {
  mkdir -p "$PAYLOAD_DIR"
  tar -xzf "$(staged_artifact_path "$ARCHIVE")" -C "$PAYLOAD_DIR"
}

verify_payload() {
  local file

  for file in \
    agentctl \
    agentctl-daemon \
    hooks/pre-tool-use \
    hooks/post-tool-use \
    hooks/subagent-start \
    hooks/subagent-stop
  do
    if [[ ! -f "$(payload_path "$file")" ]]; then
      echo "Release archive is missing $file" >&2
      exit 1
    fi
  done
}

install_downloads() {
  extract_downloads
  verify_payload
  cp "$CHECKSUMS_DOWNLOAD" "$CHECKSUMS_FILE"
  mv "$(payload_path "agentctl")" "$BIN_DIR/agentctl"
  mv "$(payload_path "agentctl-daemon")" "$BIN_DIR/agentctl-daemon"
  mv "$(payload_path "hooks/pre-tool-use")" "$HOOKS_DIR/pre-tool-use"
  mv "$(payload_path "hooks/post-tool-use")" "$HOOKS_DIR/post-tool-use"
  mv "$(payload_path "hooks/subagent-start")" "$HOOKS_DIR/subagent-start"
  mv "$(payload_path "hooks/subagent-stop")" "$HOOKS_DIR/subagent-stop"
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

curl -fsSL "$BASE_URL/SHA256SUMS" -o "$CHECKSUMS_DOWNLOAD"
curl -fsSL "$BASE_URL/$ARCHIVE" -o "$(staged_artifact_path "$ARCHIVE")"

verify_downloads
install_downloads

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

"$BIN_DIR/agentctl" install-hooks --settings "$CLAUDE_SETTINGS" --hooks-dir "$HOOKS_DIR"

# ─── 5. Register daemon as background process ─────────────────────────────────
if should_skip_daemon_registration; then
  echo "Skipping daemon registration"

elif [[ "$OS" == "Darwin" ]]; then
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
