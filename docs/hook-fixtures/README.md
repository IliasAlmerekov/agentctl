# Hook Fixtures

These JSON files are manual stdin fixtures for validating compiled hook binaries:

```bash
rtk env PATH="$HOME/.bun/bin:$PATH" bun run build:hooks
rtk bash -lc 'dist/hooks/pre-tool-use < docs/hook-fixtures/pre-tool-use.json'
rtk bash -lc 'dist/hooks/post-tool-use < docs/hook-fixtures/post-tool-use.json'
rtk bash -lc 'dist/hooks/subagent-start < docs/hook-fixtures/subagent-start.json'
rtk bash -lc 'dist/hooks/subagent-stop < docs/hook-fixtures/subagent-stop.json'
```

When the daemon or auth token is unavailable, hooks should fail open with exit code `0`.
