# Native app icon badge policy

## 목표

메신저 unread badge를 **서버 `notification_events` SSOT**와 앱 아이콘·Android tray badge를 일치.

## 구현

| 항목 | 경로 |
|------|------|
| SSOT API | `GET /api/me/notifications/badge-count` |
| Client store | `lib/notifications/notification-badge-count-store.ts` |
| React bridge | `components/push/NativeBadgeSync.tsx` |
| Android tray | `DibayFirebaseMessagingService` — `setNumber(badgeCount)` on `dibay_messages` |

## 동작

1. **로그인** — `badge-count` poll → `syncNativeBadgeCount(total)`
2. **읽음·방 진입·알림 탭** — read API → `requestNotificationBadgeCountResync`
3. **FCM data** — `badgeCount` + `notificationEventId` (10s dedupe)
4. **로그아웃** — `clearNativeBadgeCount()`

## 금지 (메신저 P0)

- ShortcutBadger
- `@capawesome/capacitor-badge`를 메신저 unread 주 경로로 사용
- `owner-hub-badge` `communityMessengerUnread`를 메신저 탭 badge SSOT로 사용

## Android

- 채팅 channel: `dibay_messages`
- 부재중 channel: `dibay_calls_missed`
- Launcher별 아이콘 badge 지원은 기기마다 상이; tray `setNumber`가 P0 주 경로.

## QA

- unread 3 → tray number 3 + badge-count total 3
- 방 진입 → total 감소
- 로그아웃 → 0

`npx cap sync android` 후 실기기 확인. 상세: `docs/dibay-notification-p0-policy.md`
