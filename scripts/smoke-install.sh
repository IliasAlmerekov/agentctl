#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/agentctl-smoke-home.XXXXXX")"
DAEMON_PID=""
STATUS_OUT="$SMOKE_HOME/status.out"

cleanup() {
  if [[ -n "$DAEMON_PID" ]]; then
    kill "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi
  rm -rf "$SMOKE_HOME"
}

trap cleanup EXIT

cd "$ROOT"

bun run build

export HOME="$SMOKE_HOME"
export AGENTCTL_BASE_URL="file://$ROOT/dist"
export AGENTCTL_SKIP_DAEMON_REGISTRATION=1

bash "$ROOT/install.sh"

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

echo "agentctl install smoke passed on $(uname -s)-$(uname -m)"
