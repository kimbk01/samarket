# DIBAY 알림·뱃지·부재중 P0 정책

## SSOT

| 도메인 | 테이블 | 비고 |
|--------|--------|------|
| 메신저 메시지·부재중 | `notification_events` | badge·push·read 단일 |
| commerce/social/admin | `notifications` (legacy) | P0 범위 밖 |

## 메시지 파이프라인

1. `POST .../messages` → `notifyMessagePipeline`
2. block → event 0
3. **항상** `createNotificationEvent` (cooldown DB skip 금지)
4. mute / same-room foreground → `push_suppressed_reason`·`sound_suppressed_reason` 기록
5. same-room foreground → `markRoomRead` (auto-read)
6. `dispatchNotificationPushIfAllowed` → FCM data-only + `badgeCount` + `notificationEventId`

## 부재중

- `notifyMissedCallPipeline` — 양 당사자 각 `type=missed_call`
- deep link: `/community-messenger/rooms/{roomId}?focus=call-history&callId={sessionId}`

## Badge

- API: `GET /api/me/notifications/badge-count` (`count_notification_events_badge` RPC)
- UI/native: `notification-badge-count-store` + `NativeBadgeSync`
- Android tray: `NotificationCompat.setNumber(badgeCount)` (`dibay_messages` channel)

## Read

| API | 용도 |
|-----|------|
| `POST /api/me/notifications/read` | 알림 탭 (opened_at) |
| `POST /api/me/notifications/room-read` | 방 진입 |
| `POST /api/me/notifications/missed-call-read` | 통화내역 focus |

## Dedupe (10s)

- `notification_event_id` — push dispatch, native tray, in-app sound
- `room_id + message_id` — sound coalesce

## 레거시 제거 (메신저)

- `community-chat-inapp-notify` / `group-chat-inapp-notify` / `trade-chat-inapp-notify` → pipeline
- `communityMessengerUnread` hub badge → `badge-count` total
- ShortcutBadger / Capacitor Badge 메신저 경로 금지 (Android `setNumber` 사용)

## QA (2기기)

`adb logcat -s DIBAY_FCM DIBAY_MISSED_CALL DIBAY_NOTIFY` + 서버 `[notify-*]`

| # | B 상태 | PASS |
|---|--------|------|
| 1 | 같은 방 foreground | 무음·무 tray·badge 0 증가 |
| 2 | 다른 화면 | banner+1회 sound+badge↑ |
| 3 | 홈 | tray+sound |
| 4 | background | FCM→local notif |
| 5 | 잠금 | 동일 |
| 6 | cold start | room+badge sync |
| 7 | 알림 탭 | deep link OK |
| 8 | 부재중 탭 | call-history |
| 9 | 방 진입 | badge 해제 |
| 10 | 통화내역 | missed badge 해제 |
