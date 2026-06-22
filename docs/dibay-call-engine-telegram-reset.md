# DIBAY Telegram-Style Call Engine Reset

## 목적

통화 lifecycle를 **CallEngine controller** 단일 엔진으로 강제한다.

- `dispatchCallEngineSignal` — UI·Native·FCM·hydrate 유일 진입점
- `call-engine-actions` — PATCH HTTP 실행 (controller 내부)
- terminal 이후 동일 callId 재진입/재표시 금지

## 구조 SSOT

| 역할 | SSOT |
|---|---|
| Controller | `call-engine-controller.ts` (`dispatchCallEngineSignal`, `subscribeCallEngineSnapshot`) |
| 발신 CTA | `launchOutgoingDirectCall` (`call-session-navigation-seed.ts`) |
| lifecycle PATCH | `call-engine-actions` |
| route gate | `call-engine-route-gate` |
| Agora join | `call-engine-agora-gate` |
| ringtone/ringback | `call-engine-ringtone-owner` |
| surface | `call-engine-surface-owner` |
| consumed | `call-engine-locks` + `incoming-call-state` thin cache |
| presentation | `call-presentation-ownership.ts` |

## 필수 파일

- `call-engine-types.ts` (`CallEnginePhase` alias)
- `call-engine-state.ts`
- `call-engine-store.ts`
- `call-engine-locks.ts` (ringtone + ringback locks)
- `call-engine-transitions.ts`
- `call-engine-actions.ts`
- `call-engine-controller.ts`
- `call-engine-surface-owner.ts`
- `call-engine-ringtone-owner.ts`
- `call-engine-route-gate.ts`
- `call-engine-agora-gate.ts`
- `call-engine-native-bridge.ts`
- `call-engine-debug.ts`

## 상태 전이

- `idle -> outgoing_creating -> outgoing_ringing -> joining -> connected -> ending -> ended`
- `incoming_ringing -> accepting -> joining -> connected`
- `connected -> reconnecting -> connected | failed`
- terminal: `ended | rejected | missed | cancelled | failed`

## Android

- Native signal-only — PATCH는 Web CallEngine만
- `CallSessionPatchHelper` 삭제

## LOCKED CONTRACT

- UI에서 `callEngineActions` 직접 호출 금지 — `dispatchCallEngineSignal` 우선
- `incoming-call-accept-gateway`는 thin re-export
- `notification_events`/badge는 call lifecycle 미접근
- `accept/reject/end/join/route/ringtone/ringback` callId당 1회

## 검증

```bash
npm run lint
npx tsc --noEmit
npx vitest run lib/community-messenger/call-engine
npx vitest run lib/community-messenger
cd android && ./gradlew assembleDebug
```

## 최종 판정 (2026-06-22)

**CODE PASS / DEVICE QA PENDING**

| 영역 | 상태 |
|---|---|
| CallEngine unit/e2e | PASS |
| tsc | PASS |
| Android `assembleDebug` | PASS (아래 APK 경로) |
| `verify:cm-kakao-telegram-navigation-contract` | **기존 FAIL** (CallEngine 무관) |
| 실기기 QA | **PENDING** (체크리스트 아래) |

### `verify:cm-kakao-telegram-navigation-contract` 기존 FAIL 분리

| 항목 | 내용 |
|---|---|
| 실패 파일 | `lib/community-messenger/call-page-host-ownership.ts` (ENOENT) |
| 검사 스크립트 | `scripts/verify-cm-kakao-telegram-navigation-contract.mjs:102` |
| 이번 CallEngine 변경 | **해당 파일 import/참조 추가 없음** — `git grep call-page-host-ownership` 결과 문서·verify 스크립트·`.mdc` 규칙만 참조 |
| main 기준 | `git show HEAD:lib/community-messenger/call-page-host-ownership.ts` → **존재하지 않음** (기존 누락) |
| CallEngine 관련 gateway | `incoming-call-accept-gateway.ts`는 thin re-export 유지, `SSOT_CONTRACT`·`buildPostAcceptActiveCallHref`·`patchCommunityMessengerCallSession` 주석 계약 유지 |

### Android APK (debug)

빌드 성공 시:

`android/app/build/outputs/apk/debug/app-debug.apk`

추가 변경:

- `CallSessionPatchHelper.java` 삭제 (dead code)
- `DibayServerOrigin.java` 추가 (기존 main에도 참조만 있고 파일 누락 — 빌드 unblock)

### 실기기 QA 체크리스트 (APK 설치 후)

- [ ] **앱안 수신**: web banner 1개만 표시
- [ ] **앱밖 수신**: native heads-up/FSI와 web banner 중복 없음
- [ ] **잠금화면 수신**: FSI 수락 → Web PATCH 1회
- [ ] accept/reject/end/cancel PATCH callId당 1회
- [ ] Agora join callId당 1회
- [ ] 벨소리/링백 중복 없음
- [ ] 종료 후 같은 callId 재등장 없음
- [ ] missed_call notification이 incoming UI 재오픈 안 함
- [ ] 종료 직후 새 통화 즉시 발신 가능
- [ ] 발신 connecting 45초 timeout/fallback 동작
