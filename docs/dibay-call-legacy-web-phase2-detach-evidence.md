# DIBAY Call — Legacy Web Phase 2 Detach Evidence (P2-1 + P2-5)

Status: **P2-1 + P2-5 complete** — 2026-06-28  
Prerequisite: Phase 1 inventory pushed (`60f4d17e`), Native Runtime HARD LOCK closed (`008b235d`)

**Scope:** Partial Phase 2 only. P2-2, P2-3, P2-4 **not implemented** (red-team hold).

## What changed

| Step | File | Action |
|---|---|---|
| P2-1 | `android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java` | Removed unreachable Legacy Web pending-route / V4 owner handoff after Native voice/video early returns |
| P2-5 | `scripts/verify-*-runtime-contract.cjs`, `verify-incoming-call-push-delivery-contract.cjs`, `verify-call-v4-structure-lock.cjs` | DEAD path asserts + native SSOT asserts |
| P2-5 | `lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts` | PushDelivery DEAD path regression test |
| P2-5 | This document | Phase 2 detach evidence |

## Removed from PushDelivery (DEAD — P2-1)

Production Native FCM always enters `NativeVoiceCallRuntime.handleIncoming` or `NativeVideoCallRuntime.handleIncoming` first (flags on). The following Legacy Web branches were **unreachable** and detached:

- `CallV4Lane.isTelegramLaneEnabled` owner claim (`tryClaimIncomingOwner`)
- Foreground Web SSOT: `MainActivity.deliverCallIncomingEvent`, `incoming_call_foreground_web_ssot`
- Background/lock V4 presentation: `IncomingCallBackgroundNotifier.presentLockIncoming`, `presentV4NonForegroundIncoming`
- Legacy ring at push boundary: `IncomingCallRingOwner.start` (Native Runtime owns ring)

Non-native fall-through now logs only:

- `legacy_web_pending_route_detached` (Log + `DibayCallPushLog`)

## Native path unaffected (rationale)

| Layer | Unchanged |
|---|---|
| FCM | `DibayFirebaseMessagingService` still delegates to `IncomingCallPushDelivery.deliver`; native paths still skip Web pending-route persistence (`native_*_pending_route_skipped`) |
| Voice/Video Runtime | `NativeVoiceCallRuntime.handleIncoming` / `NativeVideoCallRuntime.handleIncoming` unchanged — first branches in PushDelivery |
| Guard / O2 / O3 / O4 | No edits |
| BackgroundNotifier bundle | Still present for V4 FSI/fallback boundary (P2-4 hold — MainActivity replay untouched) |

## Verify gate (P2-1 + P2-5 — device QA skipped)

Run after implementation:

```bash
npm run verify:native-voice-runtime-contract
npm run verify:native-video-runtime-contract
npm run verify:call-v4-incoming-fsi-fallback-boundary
npm run verify:call-v4-structure-lock
vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts
```

Results recorded in commit message / CI.

| # | Command | Result (2026-06-28) |
|---|---|---|
| 1 | `npm run verify:native-voice-runtime-contract` | PASS |
| 2 | `npm run verify:native-video-runtime-contract` | PASS |
| 3 | `npm run verify:call-v4-incoming-fsi-fallback-boundary` | PASS |
| 4 | `npm run verify:call-v4-structure-lock` | PASS |
| 5 | `vitest run lib/community-messenger/call-v4/__tests__/call-v4-import-guard.test.ts` | PASS (24 tests) |

Device QA: **skipped** (Native Runtime behavior unchanged).

## Hold (not in this PR)

| Step | Reason |
|---|---|
| P2-2 Web outgoing dial bridge | O2 establishment — separate approval after P2-1 validation |
| P2-3 CallV4Provider incoming hard-disable | Web mount / foreground state — isolated verification needed |
| P2-4 MainActivity pending replay | Route replay / lock / notification intent regression risk |

## References

- Phase 1: `docs/dibay-call-legacy-web-phase1-inventory.md`
- Native HARD LOCK: `docs/dibay-call-native-runtime-hard-lock.md`
