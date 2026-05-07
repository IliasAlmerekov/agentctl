# Hook Blocking Contract

Source of truth: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks).

agentctl uses Claude Code command hooks. A hook receives JSON on stdin, talks to the local agentctl daemon, and communicates the result back to Claude Code through its process exit code and output streams.

## agentctl contract

- `PreToolUse` is the only agentctl hook that can block a tool call before it runs.
- When the daemon returns `block: true`, `pre-tool-use` writes the daemon reason to `stderr` and exits with `exit(2)`.
- Claude Code treats `exit(2)` on `PreToolUse` as a blocking error: the tool call is not executed and the `stderr` text is shown to Claude as feedback.
- When the daemon allows the call, is unavailable, rejects auth, times out, returns an unreadable response, or receives malformed hook input, agentctl hooks exit `0`.
- This fail open behavior is intentional. agentctl being down must not make Claude Code unusable.

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
