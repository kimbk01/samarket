# DIBAY Telegram-Style Call Engine Reset

## 목적

통화 lifecycle를 단일 엔진으로 강제해 다음을 보장한다.

- `accept/reject/end/cancel/missed` PATCH: callId당 1회
- Agora join: callId당 1회
- ringtone owner: callId당 1회
- route 이동: callId당 1회
- terminal 이후 동일 callId 재진입/재표시 금지
- 앱안/앱밖/잠금화면 수신 UI owner 단일화

## 구조

- `lib/community-messenger/call-engine/call-engine-types.ts`
- `lib/community-messenger/call-engine/call-engine-state.ts`
- `lib/community-messenger/call-engine/call-engine-store.ts`
- `lib/community-messenger/call-engine/call-engine-locks.ts`
- `lib/community-messenger/call-engine/call-engine-transitions.ts`
- `lib/community-messenger/call-engine/call-engine-actions.ts`
- `lib/community-messenger/call-engine/call-engine-surface-owner.ts`
- `lib/community-messenger/call-engine/call-engine-ringtone-owner.ts`
- `lib/community-messenger/call-engine/call-engine-route-gate.ts`
- `lib/community-messenger/call-engine/call-engine-agora-gate.ts`
- `lib/community-messenger/call-engine/call-engine-native-bridge.ts`
- `lib/community-messenger/call-engine/call-engine-debug.ts`

## 상태 전이

- `idle -> outgoing_creating -> outgoing_ringing -> joining -> connected -> ending -> ended`
- `incoming_ringing -> accepting -> joining -> connected`
- terminal: `ended | rejected | missed | cancelled | failed`
- terminal 이후: accept/join/ringtone/surface/route 재시작 금지

## source별 정책

### 앱 foreground
- Web banner만 owner
- native pill 금지

### 앱 background
- native notification/heads-up owner
- Web banner 중복 금지

### 잠금화면
- FullScreenIntent owner
- Web banner 중복 금지

## Android 정책

- Native는 signal-only
- `CallSessionPatchHelper.patch(...)` 직접 호출 금지
- accept/reject/end/missed는 Web CallEngine PATCH owner 단일 경로
- terminal 시 notification clear 유지

## 저장소 접근 정책

- call 관련 session/local storage 직접 접근 금지
- `call-engine-store` API를 통해서만 접근

## QA 시나리오

- A~H(앱안/앱밖/잠금, 거절, 취소, 부재중, 연속통화, 재접속) 시나리오를 call-engine 테스트로 검증

## 재발 방지 검색어

- `CallSessionPatchHelper.patch`
- `patchCommunityMessengerCallSession(..., "accept"|"reject"|"end"|"cancel"|"missed")`
- `joinCommunityMessengerAgoraChannelOnce(` (call-engine 외부)
- `sessionStorage.*call`
- `cm_minimized_call`

## LOCKED CONTRACT

- 통화 lifecycle owner는 `CallEngine` only.
- Native는 signal-only 정책을 유지하고 direct PATCH를 금지한다.
- foreground 수신 UI owner는 Web banner only.
- background/lockscreen 수신 UI owner는 Native notification/FSI only.
- `accept/reject/end/join/route/ringtone`은 callId당 1회만 허용한다.
- terminal 이후 동일 callId의 재표시/재수락/재조인을 금지한다.
- 새 callId는 이전 callId의 lock 잔재 영향을 받으면 실패다.
- 채팅 파일은 통화 lifecycle을 직접 제어하면 안 된다.
