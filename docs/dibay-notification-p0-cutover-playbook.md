# DIBAY 알림 P0 Cutover Playbook

## 1) Legacy 절단 순서 (롤백 가능)

1. **SSOT 타입 고정**
   - `lib/notifications/core/notification-event-types.ts`
   - `lib/notifications/core/notification-policy.ts`
   - 신규 category/type 를 먼저 수용하고 legacy category(`chat/group/trade/store/call`)는 읽기 호환만 유지.
2. **create + dispatch 단일 진입점**
   - `lib/notifications/pipeline/notification-event-dispatcher.ts`
   - 메시지/부재중 파이프라인은 `createAndDispatchNotificationEvent` 만 사용.
3. **읽음 API 분리**
   - `POST /api/me/notifications/read-category`
   - `POST /api/me/notifications/read-thread`
4. **배지 집계 단일화**
   - `countNotificationEventsBadge` 는 `notification_events` unread row 기반 fallback 집계만 사용.
5. **Android 채널 분리**
   - `DibayFirebaseMessagingService` 에 카테고리별 채널 고정.
6. **Legacy 직접 push 경로 절단**
   - `append-user-notification`/legacy `notifications` 경로는 신규 이벤트 작성 금지(읽기 호환만 유지).
7. **롤백 플랜**
   - 장애 시, dispatcher 호출부만 원복하면 push 전송 경로를 즉시 이전 방식으로 되돌릴 수 있게 유지.
   - category 확장은 additive 이므로 DB rollback 없이 서비스 레벨만 revert 가능.

## 2) Badge 단일 기준 매핑

- 서버 응답(`GET /api/me/notifications/badge-count`)이 제공하는 필드:
  - `chatMessage`, `groupMessage`, `tradeMessage`, `tradeStatus`
  - `orderStatus`, `deliveryStatus`, `communityActivity`
  - `adminMarketingBanner`, `adminNotice`, `missedCall`, `total`
- 하단 탭 매핑(클라이언트):
  - `chat` = `chatMessage + groupMessage`
  - `trade` = `tradeMessage + tradeStatus`
  - `stores` = `orderStatus + deliveryStatus`
  - `community` = `communityActivity` only (P0.1 — `admin_notice` → Tier1 bell + app icon total)
- 기존 owner-hub 배지는 fallback 으로만 사용.

## 3) Admin 사운드/배너 seam

- 정책 프로필: `lib/notifications/policy/notification-policy-profiles.ts`
- 사운드 프로필: `lib/notifications/policy/notification-sound-profiles.ts`
- 목적:
  - 관리자 설정 변경이 필요한 항목과 고정 항목(예: incoming_call_signal badge 비활성)을 코드 계약으로 분리.
  - Android 채널 ID 를 카테고리 기준으로 고정해 운영 변경 시 UI 코드 수정 없이 프로필 교체 가능하게 유지.

## 4) 테스트/QA 고정 명령

### 자동 테스트

```bash
npm run verify:notification-p0-contract
vitest run lib/notifications/__tests__/pipeline/notify-message-pipeline.test.ts
```

### 실기기 QA A~J (2 디바이스)

A. 같은 방 foreground 수신: tray/sound 없음, unread 증가 없음  
B. 다른 화면 foreground 수신: in-app banner + 1회 sound  
C. background 수신: OS tray + 채널별 노출  
D. lockscreen 수신: lockscreen visibility 정책 일치  
E. killed 상태 수신: cold start deeplink 정상  
F. missed_call 수신: 통화 UI 아님, 부재중 알림만 노출  
G. `read-category` 호출: 해당 category badge 즉시 감소  
H. `read-thread` 호출: 해당 room/call thread badge 즉시 감소  
I. admin marketing 이벤트: `dibay_marketing` 채널 사용  
J. incoming call: 일반 알림 채널 미사용, 통화 전용 경로만 사용

## 5) 운영 로그 포인트

- 서버: `[notify-message]`, `[notify-badge]`, `[notify-missed-call]`
- Android: `DIBAY_FCM`, `DIBAY_MISSED_CALL`, `DIBAY_NOTIFY`
- 장애 판단 기준:
  - 동일 `notificationEventId` 중복 tray 노출
  - incoming call 이 일반 메시지 채널로 표시됨
  - badge total 과 category 합 불일치
