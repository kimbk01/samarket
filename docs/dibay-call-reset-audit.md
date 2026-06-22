# DIBAY Call Reset Audit

## 결론

- 현재 구조는 `Web gateway + CallClient + Android native` 경로가 혼재되어 있어 `callId` 단위 단일 owner가 깨져 있었다.
- 본 리셋에서 Telegram식 단일 Call Engine 구조(`lib/community-messenger/call-engine/`)를 신설하고 owner를 단일 경로로 수렴했다.

## 핵심 문제(감사 기준)

### 1) PATCH owner 중복

- `accept`: `incoming-call-accept-gateway` + `CommunityMessengerCallClient` + `IncomingCallActionCoordinator`
- `reject/missed/end`: `GlobalCommunityMessengerIncomingCall`/`CallForegroundService` 등에서 직접 PATCH 가능

### 2) foreground 수신 UI 중복 가능

- `IncomingCallPushDelivery`가 foreground에서 native pill(`IncomingCallForegroundUiLauncher`)과 Web 경로를 동시에 열 수 있었다.

### 3) surface owner 중복

- `CallIncomingChrome` / `CommunityMessengerActiveCallHost` / call page / minimize(dock/pip) 경로가 분산되어 동시 점유 가능성이 있었다.

### 4) terminal 이후 재등장 위험

- poll/realtime/hydrate 경로가 분산되어 terminal latch 이후 재표시 race가 가능했다.

### 5) 연속 통화 저해

- zombie ringing 및 callId 단위 정리 누락으로 새 callId 발신/수신이 막히는 케이스가 존재했다.

## 이번 리셋에서 고정한 owner 정책

- PATCH owner: `call-engine-actions`
- Agora join owner: `call-engine-agora-gate`
- ringtone owner: `call-engine-ringtone-owner`
- route owner: `call-engine-route-gate`
- incoming UI owner: `call-engine-surface-owner`
- native 정책: **signal-only** (Android native direct PATCH 제거)

## Android 감사 결과 반영

- `IncomingCallActionCoordinator`의 `CallSessionPatchHelper.patch("accept"|"reject"|"missed")` 제거
- `CallForegroundService`의 direct `"end"` PATCH 제거
- `IncomingCallPushDelivery` foreground에서 native pill 경로 제거(웹 SSOT 로그로 전환)

## 잔여 리스크/추가 확인 포인트

- 실기기에서 background/lock 경로의 FSI/notification 우선순위가 의도대로 단일 owner로 동작하는지 최종 QA 필요
- call-engine 도입 후 기존 도메인 테스트와 병행하여 regression 확인 필요
