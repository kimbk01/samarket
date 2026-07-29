# DIBAY Call Lifecycle SSOT

**Status:** structural contract  
**Scope:** 1:1 community messenger call lifecycle from dial to local cleanup

## Lifecycle

| Step | Single owner | Rule |
|------|--------------|------|
| Start | `runCallStartGuard` / `bootstrapCommunityMessengerOutgoingCallSession` | Create the server session once, then enter `/community-messenger/calls/:realSessionId` once. No `tmp_*` call route. |
| Incoming | `syncIncomingCallRing` / `sealIncomingCallTerminal` | Global owns ring and incoming terminal. FCM is signal, not state. |
| Accept | `acceptIncomingCallOnce` / `incoming-call-accept-gateway` | Exactly one `accept` PATCH via CallEngine gateway. CallClient may only request the gateway. |
| Active call | `CommunityMessengerCallClient` | Agora, media, PiP, heartbeat, and UI only. No lifecycle PATCH. |
| End | `runCallEndGuard` | Exactly one `end` / `cancel` / `reject` / `missed` PATCH. |
| Local cleanup | `releaseLocalCallSession` | Local session, tones, heartbeat, native UI/FGS cleanup only. No peer terminal. |

## Patch Owners

| Action | Allowed file |
|--------|--------------|
| `accept` | `lib/community-messenger/incoming-call-accept-gateway.ts` (CallEngine `user_accept`) |
| `end` / `cancel` / `reject` / `missed` | `lib/call/actions/call-end-guard.ts` and incoming reject gateway wrapper |
| `upgrade_to_video` / `downgrade_to_voice` | session PATCH API (`upgradeCommunityMessengerCallSessionToVideo` / CallClient scoped) |
| raw HTTP PATCH transport | `lib/call/call-actions.ts`, `lib/community-messenger/call-http-actions.ts`, server route handlers |

## DO NOT

- Do not open `/community-messenger/calls/tmp_*`.
- Do not use `tmp→real` route replace or `outgoingDial=1`.
- Do not call lifecycle PATCH from `CommunityMessengerCallClient`.
- Do not call peer end from unmount, recovery, route exit, pagehide, or native local dismiss.
- Do not call `CallSessionPatchHelper.patch(..., "end" | "accept" | "reject" | "missed")` from Android UI/FGS helpers.
- Do not make `hardClearActiveCallSession` a peer PATCH owner. It is deprecated and local-only.

## QA

| ID | Scenario | PASS |
|----|----------|------|
| A | Caller starts call | POST completes once, then route enters real session once. |
| B | Caller route handoff | No `/calls/tmp_*`, no `outgoingDial=1`, no handoff cleanup. |
| C | Callee receives ringing | Ring starts only through incoming ring owner. |
| D | Callee accepts | `accept` PATCH logs once through gateway. |
| E | Caller cancels ringing | `runCallEndGuard(action=cancel)` logs once. |
| F | Callee rejects | `runCallEndGuard` or incoming reject gateway logs once. |
| G | Active call ends | `runCallEndGuard(action=end)` logs once, then local cleanup. |
| H | Recovery/pagehide/unmount | Local cleanup only; no peer terminal PATCH. |
| I | Android native dismiss/FGS stop | Native local UI/FGS cleanup only; JS gateway owns server PATCH. |

## Fail Signatures

- `call_client_unmount_caller_preconnect`
- `/community-messenger/calls/tmp_*`
- `outgoingDial=1`
- `CommunityMessengerCallClient` containing `method: "PATCH"` or `patchCommunityMessengerCallSession`
- Android `CallSessionPatchHelper.patch` inside native UI/FGS call action files
- `call_end_sent_to_peer` immediately after route handoff

## Change Log

| Date | Change |
|------|--------|
| 2026-06-22 | DIBAY call lifecycle SSOT: removed tmp route handoff, moved lifecycle PATCH to gateways, and made native/local cleanup peer-PATCH-free. |
