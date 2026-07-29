# DIBAY Call Authority LOCK

**Status:** AUTHORITY LOCK (2026-07-29)  
**Replaces / supersedes for terminal·duration·busy·missed contracts:** ad-hoc patches that conflict with this doc.  
**Does not blindly reopen:** O2 / O3 / O4 / Track①③④ / Voice UI / Video UI / PiP / Dock — those remain unless a listed P0/P1 root cause required a minimal native change (see § Conflicts).

SSOT modules:

- `lib/community-messenger/call-authority/call-duration-authority.ts`
- `lib/community-messenger/call-authority/call-terminal-reason-authority.ts`
- Server writer: `updateCommunityMessengerCallSession` in `lib/community-messenger/service.ts`

## Final Authority

| Concern | Authority |
|---|---|
| Session status / ended_at / ended_reason / answered_at | `updateCommunityMessengerCallSession` (single HTTP PATCH path) |
| Duration | `ended_at − answered_at` via `resolveAuthoritativeCallDurationSeconds` (DB has no `connected_at`; `answered_at` is connectedAt proxy) |
| Busy | Server `peer_busy` on start + unique live indexes; Android native suppresses 2nd incoming UI **without** `reject`/`declined` |
| Concurrent ringing (incoming policy) | `missed` + `incoming_policy_superseded` (not `reject`/`declined`); missed Bell skipped for that reason |
| Missed Bell | Only on transition to `status=missed` + delivery/claim evidence; **await Bell** write before PATCH returns (no fire-and-forget) |
| History row | One `call_logs` row per `session_id` (unique index); created in finalizeLog |
| History peer | `caller_user_id=initiator`, `peer_user_id=recipient` via `resolveCanonicalCallLogPeerUserId` — never viewer-relative `mapCallSession.peerUserId` |
| Android establishment | Native Voice/Video Runtime (O2–O4 unchanged for happy path) |
| iOS establishment | CallKit + Native Voice/Video coordinators |
| Desktop | CallV4 web establishment only (Capacitor sync-only) |

## Allowed writers (ended_at / ended_reason / answered_at / duration)

| Field | Allowed |
|---|---|
| Session terminal fields | `updateCommunityMessengerCallSession` only (incl. forceEnd → same path with `redial_replaced`) |
| `duration_seconds` | `createCommunityMessengerCallLog` using duration Authority |
| SQL cron `cleanup_stale_community_messenger_call_sessions` | Keep for heartbeat orphans; prefer TS heartbeat path with `heartbeat_timeout` reason |

## Forbidden writers

- Raw `.update({ ended_at, ended_reason })` outside `updateCommunityMessengerCallSession` for product redial/end
- UI inventing history rows without session
- UI duration = `endedAt − startedAt` (ringing start)
- Late `missed` overwriting `rejected` / `cancelled`
- Second incoming UI while RINGING/ACCEPTING/CONNECTING/CONNECTED on same device (Android)

## Status ↔ product endReason

| DB status | Typical ended_reason | Product |
|---|---|---|
| cancelled | canceled | caller_cancelled |
| rejected | declined | callee_rejected |
| missed | missed | ring_timeout |
| ended | ended | local_ended / remote_ended (UI direction) |
| ended | failed_* / heartbeat_timeout | media_failed / network_lost |
| ended | redial_replaced | superseded |
| (API error) | peer_busy | callee_busy (no session or local stub) |

## Missed policy (LOCKED)

- `ring_timeout` / `status=missed` → callee missed Bell (evidence required)
- Evidence = `notification_deliveries` call_ringing sent/nativeAck **or** `incoming_push_claimed_at`
- Writer must **await Bell** (`notifyMissedCallPipeline`) — serverless freeze must not drop the event
- `answered_elsewhere` → not missed
- `callee_busy` / `peer_busy` → not missed
- connected → not missed
- `callee_rejected` → not missed
- `caller_cancelled` → not missed (terminal dismiss push only)
- `incoming_policy_superseded` → status may be missed but Bell skipped

## History peer (LOCKED)

```text
caller_user_id = initiator
peer_user_id   = recipient   (canonical other participant)
viewer display peer = resolveCallLogDisplayPeerUserId (read path only)
DO NOT write mapCallSession(actor).peerUserId into call_logs
```

Contaminated rows (`peer_user_id = caller_user_id`) are backfilled only when
`caller_user_id = session.initiator` and `recipient` is known (see migration
`20260729140000_cm_call_logs_peer_user_id_backfill.sql`).

## Conflicts with prior LOCKs

| Prior LOCK | Conflict? | Resolution |
|---|---|---|
| O2 Outgoing | No | Unchanged establishment |
| O3 Connected | No | Unchanged |
| O4 End | Minimal | Voice iOS cleanup now respects `reportCallKitEnded` (parity with Video); FGS null-intent stop |
| Track① Legacy Web Shutdown | No | Desktop CallV4 quarantine kept |
| Track③ Dead code | No | No bulk delete this round |
| Multi-device policy | No | answered_elsewhere completion(false) compile fix |
| CallKit orphan invent ban | Extended | Untracked cancel: `markTerminalSuppressed` + UUID-safe end (no random UUID invent); late incoming report-then-end |

## iOS caller-cancel while ringing (LOCKED)

```text
caller cancel → status=cancelled + call_canceled VoIP
→ tracked: reportCallEnded → CallKit dismiss + runtime cleanup
→ untracked race: terminalSuppressed + endCallKitSessionIfUuidKnown
→ late incoming: reportNewIncomingCall then immediate end (PushKit rule)
→ history: cancelled (not missed)
→ missed Bell / App Icon: not created
```

## Static verify

```bash
npm run verify:call-authority-contract
vitest run lib/community-messenger/call-authority
vitest run lib/community-messenger/__tests__/call-log-row-copy.test.ts
vitest run lib/community-messenger/__tests__/call-multi-device-authority.test.ts
```
