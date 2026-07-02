# DIBAY Call V4 Terminal Recovery Suppress HARD LOCK

Status: **HARD LOCK** (2026-07-02)

## Lock Statement

V4 Terminal Recovery Suppress HARD LOCK. `finalizeCallV4Terminal()` must call legacy terminal dismiss (`pinCommunityMessengerCallTerminalSurfaceDismiss` + `hardClearActiveCallSession`) after `cleanupCallV4` and before Web route exit, so `CallActiveSessionRecoveryHost` and `/calls` → `/calls-v4` redirect cannot resurrect the outgoing presentation shell after terminal exit.

## Scope

| In scope (LOCKED) | Out of scope (separate approval) |
|---|---|
| `finalizeCallV4Terminal` terminal dismiss pin | Native Voice/Video Runtime |
| `pinCommunityMessengerCallTerminalSurfaceDismiss` on V4 terminal | Missed outgoing cleanup LOCK |
| `hardClearActiveCallSession` on V4 terminal | Video UI / PiP / Camera / Audio Route |
| Android outgoing presentation exit after cleanup | O4 end ownership dispatcher |

## Locked Scenarios (RED TEAM PASS)

| Scenario | callId | Evidence |
|---|---|---|
| P2-4 connected end → exit | `3b854d29-cd4d-48fb-9980-38a806b71bec` | `.qa-logs/p2-end-ui-residue-qa/report-2026-07-02T05-05-59-886Z.json` |
| P2-5 redial — old outgoing shell absent | old `d68f3138-6779-4ab4-b45c-9dac157503f2` | same report |

QA harness: `.qa-logs/p2-end-ui-residue-qa.mjs`

## Required PASS Chain (caller device)

```
cleanup_done
  ↓ android_outgoing_presentation_exit
  ↓ exit_screen
  ↓ probe: no outgoing URL / shell (P2-4)
  ↓ redial: no old callId shell (P2-5)
```

## Code Touch Boundary (LOCKED — no change without red-team approval)

- `lib/community-messenger/call-v4/call-v4-actions.ts` — `finalizeCallV4Terminal` dismiss pin + exit order

## Verification

```bash
node .qa-logs/p2-end-ui-residue-qa.mjs --only=P2-4,P2-5
```

## Track Status

**CLOSED.** Do not reopen without explicit red-team approval.
