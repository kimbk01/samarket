# DIBAY Call Reset Audit

## 결론 (main 기준)

- `lib/community-messenger/call-engine/` 인프라는 존재하나, UI·gateway·orchestrator·그룹 훅이 lifecycle를 분산 소유하고 있었다.
- 본 리셋은 **CallEngine controller** 단일 진입점으로 PATCH/route/join/ringtone/surface를 수렴한다.
- Android는 런타임 PATCH 없음(signal-only). `CallSessionPatchHelper`는 dead code.

## 파일별 lifecycle 소유권 (감사)

| 파일 | PATCH | Agora join | Ringtone | Route | Surface |
|---|---|---|---|---|---|
| `call-engine-controller.ts` | **SSOT** | gate 경유 | owner 경유 | gate 경유 | owner 경유 |
| `call-engine-actions.ts` | HTTP 실행 | — | stop | — | — |
| `incoming-call-accept-gateway.ts` | thin → controller | — | — | thin → controller | — |
| `CommunityMessengerCallClient.tsx` | controller signal | controller | controller | controller | presentation |
| `GlobalCommunityMessengerIncomingCall.tsx` | controller signal | — | engine ringtone | preview only | surface gate |
| `use-community-messenger-group-call.ts` | controller signal | engine gate | engine | — | overlay UI |
| `call-page-leave-patch.ts` | engine keepalive | — | — | — | — |
| `messenger-call-missed-patch.ts` | engine missed | — | — | — | — |
| `lib/call/call-actions.ts` PATCH | **삭제·흡수** | — | — | — | — |
| `lib/call/actions/call-accept-guard.ts` | **삭제** | — | — | — | — |
| Android `IncomingCallActionCoordinator` | signal only | — | native ring | deep link | FSI/Activity |

## 중복 경로 (제거/흡수 대상)

| 검색어 | 발견 위치 | 조치 |
|---|---|---|
| `callEngineActions.acceptIncoming` | gateway, CallClient, group hook | controller `user_accept` |
| `callEngineActions.patch reject/end` | Global, CallClient, group | controller signals |
| `patchCommunityMessengerCallMissedOnce` | Global, CallClient, group | controller `scheduleMissedTimeout` |
| `runCallAcceptGuard` | tests only | 삭제 |
| `patchCommunityMessengerCallSession` (lib/call) | call-actions duplicate | call-http-actions 단일화 |
| raw `fetch` PATCH pagehide | call-page-leave-patch | engine keepalive |
| `agora.joinAndPublish` | group hook | call-engine-agora-gate |
| `startOutgoingRingback` | CallClient, ringback controller | call-engine-ringtone-owner |
| `syncIncomingCallRing` UI 직접 | Global | `startCallEngineIncomingRingtone` |
| `router.replace` accept route | gateway | controller 내부 route gate |
| `cm_minimized_call` | call-engine-store | store API only |
| `notification_events` | notifications domain | call lifecycle 미접근 (격리 테스트) |

## Android dead code

| 파일 | 상태 |
|---|---|
| `CallSessionPatchHelper.java` | 구현만 있고 `.patch()` 호출 0건 → 삭제 |
| `ForegroundIncomingCallActivity.java` | delivery 미연결 → 삭제 |
| `IncomingCallForegroundUiLauncher.java` | 호출처 없음 → 삭제 |
| `CallForegroundService` | `CallSessionPatchHelper` import만 → 정리 |

## Notification 채널 drift

| Web 정책 ID | Android 실제 | 비고 |
|---|---|---|
| `dibay_calls_incoming` | `dibay_calls_incoming_v7` | sound disabled, FSI |
| `dibay_calls_missed` | `dibay_calls_missed` | OK |
| `dibay_marketing` | 미구현 → `dibay_messages` 폴백 | marketing 채널 추가 |

## 이번 리셋 owner 정책

- **Controller**: `dispatchCallEngineSignal` / `subscribeCallEngineSnapshot`
- PATCH: `call-engine-actions`
- Agora: `call-engine-agora-gate`
- Ringtone/ringback: `call-engine-ringtone-owner`
- Route: `call-engine-route-gate`
- Surface: `call-engine-surface-owner`
- Consumed tombstone: `call-engine-locks` + `incoming-call-state` thin cache
- Native: signal-only

## 잔여 실기기 QA

- FSI vs Web banner 중복 없음
- native accept → Web PATCH 1회
- 연속 통화 (이전 callId lock 잔재 없음)
- background/lock FSI 우선순위
