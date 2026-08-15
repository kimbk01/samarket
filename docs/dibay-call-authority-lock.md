# DIBAY Call Authority LOCK

**Status:** AUTHORITY LOCK · TERMINAL UNREAD CONTRACT UPDATED (2026-08-04)
**Replaces / supersedes for terminal·duration·busy·missed contracts:** ad-hoc patches that conflict with this doc.  
**Does not blindly reopen:** O2 / O3 / O4 / Track①③④ / Voice UI / Video UI / PiP / Dock — those remain unless a listed P0/P1 root cause required a minimal native change (see § Conflicts).

Messenger terminal unread SSOT:
`docs/dibay-messenger-final-stabilization-contract.md`. Existing Native call
establishment LOCKs are unchanged.

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
| Missed notification | Room-bound missed is call_stub/B only. Only a genuinely roomless orphan may create Member A/Bell |
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

- `ring_timeout` / `status=missed` with a canonical room → callee unread
  `community_messenger_messages.call_stub` (Conversation B), not Member A/Bell
- A genuinely roomless orphan missed call may create Member A/Bell; evidence is
  `notification_deliveries` call_ringing sent/nativeAck or
  `incoming_push_claimed_at`
- An orphan A writer must be awaited; no fire-and-forget
- `answered_elsewhere` → not missed
- `callee_busy` / `peer_busy` → not missed
- connected → not missed
- `callee_rejected` → not missed
- `caller_cancelled` → not missed (terminal dismiss push only)
- `incoming_policy_superseded` → status may be missed but Bell skipped

The session writer no longer invokes `notifyMissedCallPipeline` for room-bound missed
calls. The terminal `call_stub` atomic append is the only unread fact. A future genuinely
roomless orphan writer must remain A-only.

## Terminal timeline unread (LOCKED)

The existing `community_messenger_messages.call_stub` remains the sole room timeline
event. No parallel call unread counter or call-notification total may be added.

```text
terminal call event
→ idempotent call_stub per session
→ atomic participant unread fact
→ room row / domain hub / Bottom / Member App Icon
→ normal room read cursor
→ all conversation surfaces clear
```

| Terminal result | Timeline | Unread recipient | Member Bell |
|---|---:|---|---:|
| caller canceled | yes | non-actor recipient | no |
| callee rejected | yes | caller | no |
| missed / timeout (room-bound) | yes | callee | no |
| busy (room-bound result) | yes | caller | no |
| connected then ended | yes | participant whose cursor has not passed the terminal row | no |
| answered elsewhere | yes | participant/device session whose cursor has not passed the terminal row | no |

Rules:

- Writer/actor self-unread is forbidden.
- Existing room read cursor immediately clears a terminal row already observed in an
  active room/call session; no permanent end-call attention is invented.
- `timeline visibility = unread eligibility = first-unread/divider eligibility = room
  read clear`.
- `call_stub` must not be excluded from first-unread when it counted as unread.
- Duplicate or late terminal updates for the same session update the logical row and
  must not increment unread twice.
- A late missed/timeout cannot replace rejected/cancelled or produce a second unread.

Direct terminal INSERT uses `incrementUnread: true` with the terminal actor as sender;
same-session UPDATE does not increment again. `call_stub` now participates in the same
first-unread/divider ordering; device Runtime evidence remains required.

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
| CallKit orphan invent ban | Extended | Untracked cancel VoIP: `markTerminalSuppressed` + `reportIncomingCall` (report-then-end, deterministic UUID); late incoming same path |

## iOS caller-cancel while ringing (LOCKED)

```text
caller cancel → status=cancelled + call_canceled VoIP
→ tracked: reportCallEnded → CallKit dismiss + runtime cleanup
→ untracked / cold orphan: markTerminalSuppressed + reportNewIncomingCall then immediate end (PushKit rule)
→ late incoming after suppress: reportNewIncomingCall then immediate end (same path)
→ history: cancelled (not missed)
→ Member Bell: not created
→ room-bound terminal call_stub: Conversation B until room read
```

## Static verify

```bash
npm run verify:call-authority-contract
vitest run lib/community-messenger/call-authority
vitest run lib/community-messenger/__tests__/call-log-row-copy.test.ts
vitest run lib/community-messenger/__tests__/call-multi-device-authority.test.ts
```
