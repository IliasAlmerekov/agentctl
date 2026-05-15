# Hook Blocking Contract

Source of truth: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks).

agentctl uses Claude Code command hooks. A hook receives JSON on stdin, talks to the local agentctl daemon, and communicates the result back to Claude Code through its process exit code and output streams.

## agentctl contract

- `PreToolUse` is the only agentctl hook that can block a tool call before it runs.
- When the daemon returns `block: true`, `pre-tool-use` writes the daemon reason to `stderr` and exits with `exit(2)`.
- Claude Code treats `exit(2)` on `PreToolUse` as a blocking error: the tool call is not executed and the `stderr` text is shown to Claude as feedback.
- When the daemon allows the call, is unavailable, rejects auth, times out, returns an unreadable response, or receives malformed hook input, agentctl hooks exit `0`.
- This fail open behavior is intentional. agentctl being down must not make Claude Code unusable.

## Latency contract

The public launch contract is `<250ms` p95 for normal compiled hook calls that reach the local daemon. The daemon-unavailable path must stay fail-open and `<75ms` p95, so agentctl being down does not stall Claude Code.

Slow daemon responses are measured separately. A delayed daemon response can come
from bugs, CPU pressure, or SQLite contention; WAL reduces reader/writer
blocking but does not make synchronous daemon work free. Hooks therefore use a
short fail-open timeout and the `slow-daemon` latency scenario must stay below
`<150ms` p95.

The p95 number is per hook invocation, not per user task. For parallel
sub-agents with many tool calls, cumulative overhead is roughly:

```text
worst_hook_p95_ms * number_of_hook_invocations
```

The latency script prints a `cumulative_p95_estimate` row so this overhead is
visible instead of hidden behind a single-call p95.

Fresh local Linux evidence from 2026-05-07:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" AGENTCTL_HOOK_LATENCY_RUNS=10 bun run measure:hooks
```

- normal p95: 188.32-197.27ms across pre/post/subagent hooks.
- daemon-unavailable p95: 39.31-52.04ms across pre/post/subagent hooks.

Slow daemon and cumulative overhead measurements were added after this evidence
snapshot; rerun `measure:hooks` before using the numbers for release decisions.

## Non-blocking hooks

- `PostToolUse` records token/tool accounting after a tool completes. In agentctl it exits `0`.
- `SubagentStart` records lifecycle state when a subagent starts. In agentctl it exits `0`.
- `SubagentStop` records lifecycle state when a subagent stops. Claude Code can treat `exit(2)` on this event as blocking, but agentctl does not use that path in the current control model.

## Limitations

- `exit(2)` is not a process kill. It blocks the current hook event, then Claude decides the next step after reading the reason.
- `exit(2)` does not undo work that already happened. `PostToolUse` runs after the tool completes, so files written, commands executed, and network requests already took effect.
- agentctl does not replace Claude Code permissions. Claude Code deny/ask rules are still evaluated by Claude Code; agentctl is an additional local control layer.
- Blocking only works when Claude Code hook settings still point at the installed agentctl hook binaries.
- Because hooks fail open on daemon and input failures, agentctl is not a hard security sandbox.

## Manual verification

Manual stdin fixtures live in `docs/hook-fixtures/`.

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun run build:hooks
rtk bash -lc 'dist/hooks/pre-tool-use < docs/hook-fixtures/pre-tool-use.json'
rtk bash -lc 'dist/hooks/post-tool-use < docs/hook-fixtures/post-tool-use.json'
rtk bash -lc 'dist/hooks/subagent-start < docs/hook-fixtures/subagent-start.json'
rtk bash -lc 'dist/hooks/subagent-stop < docs/hook-fixtures/subagent-stop.json'
```
