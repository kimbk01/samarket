# Native app icon badge policy

## 목표

인앱 unread count와 **앱 아이콘 badge**를 일치 (카카오톡·배민·당근 UX).

## 구현

| 항목 | 경로 |
|------|------|
| Plugin | `@capawesome/capacitor-badge` |
| Sync | `lib/push/native/sync-native-badge-count.ts` |
| React bridge | `components/push/NativeBadgeSync.tsx` (MainAppProviderTree) |
| Unread source | `myGeneralNotificationUnreadStore` / `useMyNotificationUnreadCount` |

## 동작

1. **로그인(authenticated)** — unread poll 결과 → `Badge.set({ count })`
2. **읽음 처리** — unread store 갱신 → badge 감소
3. **로그아웃·계정 전환** — `clearNativeBadgeCount()` (`Badge.clear()`)
4. **Push payload badge (APNS)** — 추후 서버 unread 포함 시 보강 가능; 현재는 **클라 sync가 주 경로**

## Android 한계

Launcher별 badge 지원 상이 (Samsung/Xiaomi 등). 미지원 기기는 no-op.

## QA

- unread 3 → 아이콘 3
- 알림함 전체 읽음 → 0
- 로그아웃 → 0
- B 계정 전환 → A badge 잔존 없음

`npx cap sync android ios` 후 실기기 확인.
