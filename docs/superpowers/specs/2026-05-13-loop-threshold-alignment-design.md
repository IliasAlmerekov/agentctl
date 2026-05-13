# Design Spec: Loop Threshold Alignment (Block on 5th Call)

Date: 2026-05-13

## Overview
Align loop-detection behavior with documented contract: identical tool calls are blocked on the 5th occurrence within a 2‑minute window. Today the daemon blocks on the 6th call because the current call is not included in the count.

## Goals
- Block on the 5th identical call in the last 2 minutes.
- Preserve existing storage behavior: do not record blocked calls in `tool_calls`.
- Keep the user-visible message consistent with the actual count (show `5x`).

## Non‑Goals
- Changing the loop window duration (still 2 minutes).
- Changing hashing/normalization behavior.
- Recording blocked calls in the database.

## Current Behavior
`detectLoop` counts only prior calls within the window. The 5th call sees a count of 4, so the block happens on the 6th call. Documentation says block on 5.

## Proposed Change (Option A)
Count the current call in the loop detector’s decision without persisting it. The detector will return `countIncludingCurrent = priorCount + 1`. A loop is detected when `countIncludingCurrent >= THRESHOLD` (THRESHOLD remains 5). The caller uses this count in the blocking message.

## Detailed Logic
- Compute `priorCount` from `tool_calls` in the existing time window.
- Compute `countIncludingCurrent = priorCount + 1`.
- If `countIncludingCurrent >= THRESHOLD`, return `{ detected: true, count: countIncludingCurrent }`.
- Otherwise return `{ detected: false }`.
- `handlePreTool` behavior remains the same: only records `tool_calls` when the call is allowed. Blocked calls are not persisted.
- Call sites: only `handlePreTool` consumes `detectLoop`; no other callers require changes.

## Tests
- Update `handlePreTool` loop test to allow 4 calls and block on the 5th.
- Assert the loop message contains `5` (count including current call).
- Assert `tool_calls` count remains `4` after the blocked 5th call (no blocked-call persistence).
- No new integration tests required.

## Documentation Impact
- README/AGENTCTL already describe “block on 5 in 2 minutes”; no text changes needed.
- `docs/hook-contract.md` unchanged.

## Risks & Mitigations
- **Risk:** Off‑by‑one in message or threshold check.
  - **Mitigation:** Update test to assert block on 5th and message count.
- **Risk:** Concurrent `PreToolUse` calls for the same session could evaluate `priorCount` simultaneously.
  - **Mitigation:** Claude Code invokes tool calls sequentially per session; behavior remains best‑effort without new locking. We document this as unchanged from current semantics.

## Rollout / Rollback
- Local code change only; no schema changes.
- Rollback by reverting the detector logic.
