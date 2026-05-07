#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/agentctl-smoke-home.XXXXXX")"
SMOKE_SOURCE="${AGENTCTL_SMOKE_INSTALL_SOURCE:-local}"
PUBLIC_INSTALL_URL="https://raw.githubusercontent.com/IliasAlmerekov/agentctl/main/install.sh"
DAEMON_PID=""
STATUS_OUT="$SMOKE_HOME/status.out"
SMOKE_SERVICE_PATH=""

cleanup() {
  if [[ -n "$DAEMON_PID" ]]; then
    kill "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_HOME"
}

trap cleanup EXIT

cd "$ROOT"

export HOME="$SMOKE_HOME"
export AGENTCTL_SKIP_DAEMON_REGISTRATION=1

if [[ "$SMOKE_SOURCE" == "local" ]]; then
  bun run build
  export AGENTCTL_BASE_URL="file://$ROOT/dist"
  bash "$ROOT/install.sh"

elif [[ "$SMOKE_SOURCE" == "public" ]]; then
  if [[ -z "${AGENTCTL_VERSION:-}" ]]; then
    echo "AGENTCTL_VERSION is required for public install smoke" >&2
    exit 1
  fi

  unset AGENTCTL_BASE_URL
  curl -fsSL "$PUBLIC_INSTALL_URL" | bash

elif [[ "$SMOKE_SOURCE" == "release-assets" ]]; then
  if [[ -z "${AGENTCTL_BASE_URL:-}" ]]; then
    echo "AGENTCTL_BASE_URL is required for release-assets install smoke" >&2
    exit 1
  fi

  bash "$ROOT/install.sh"

else
  echo "Unknown AGENTCTL_SMOKE_INSTALL_SOURCE: $SMOKE_SOURCE" >&2
  exit 1
fi

test -x "$HOME/.agentctl/bin/agentctl"
test -x "$HOME/.agentctl/bin/agentctl-daemon"
test -x "$HOME/.agentctl/bin/hooks/pre-tool-use"
test -x "$HOME/.agentctl/bin/hooks/post-tool-use"
test -x "$HOME/.agentctl/bin/hooks/subagent-start"
test -x "$HOME/.agentctl/bin/hooks/subagent-stop"
test -s "$HOME/.agentctl/SHA256SUMS"
test -s "$HOME/.agentctl/auth-token"
test -s "$HOME/.claude/settings.json"

"$HOME/.agentctl/bin/agentctl-daemon" >"$HOME/.agentctl/smoke-daemon.log" 2>"$HOME/.agentctl/smoke-daemon.error.log" &
DAEMON_PID="$!"

for _ in {1..50}; do
  if "$HOME/.agentctl/bin/agentctl" status >"$STATUS_OUT" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

"$HOME/.agentctl/bin/agentctl" status >"$STATUS_OUT"
grep -q "daemon: ok" "$STATUS_OUT"

kill "$DAEMON_PID" 2>/dev/null || true
wait "$DAEMON_PID" 2>/dev/null || true
DAEMON_PID=""

case "$(uname -s)" in
  Linux)
    SMOKE_SERVICE_PATH="$HOME/.config/systemd/user/agentctl-daemon.service"
    mkdir -p "$(dirname "$SMOKE_SERVICE_PATH")"
    printf '[Service]\nExecStart=%s/.agentctl/bin/agentctl-daemon\n' "$HOME" > "$SMOKE_SERVICE_PATH"
    ;;
  Darwin)
    SMOKE_SERVICE_PATH="$HOME/.agentctl/agentctl-daemon.plist"
    printf '<plist version="1.0"></plist>\n' > "$SMOKE_SERVICE_PATH"
    ;;
esac

"$HOME/.agentctl/bin/agentctl" uninstall
test ! -e "$HOME/.agentctl"
test -s "$HOME/.claude/settings.json"
! grep -q "/.agentctl/bin/hooks/" "$HOME/.claude/settings.json"
if [[ -n "$SMOKE_SERVICE_PATH" ]]; then
  test ! -e "$SMOKE_SERVICE_PATH"
fi

echo "agentctl install smoke passed on $(uname -s)-$(uname -m)"
