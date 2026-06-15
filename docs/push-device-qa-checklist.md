# Push device QA checklist

실기기(killed/background) 검증은 Playwright로 자동화할 수 없습니다. Maestro 또는 수동으로 아래 항목을 확인합니다.

## 사전 준비

| 항목 | Android | iOS |
|------|---------|-----|
| Firebase `google-services.json` | `android/app/` | — |
| FCM service account | `FCM_SERVICE_ACCOUNT_JSON` | — |
| APNS `.p8` key | — | `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` |
| VoIP topic | — | `APNS_VOIP_TOPIC` (보통 `{bundleId}.voip`) |
| 서버 게이트 | `PUSH_DISPATCH_ENABLED=1` 또는 `WEB_PUSH_ENABLED=1` | 동일 |

## 공통 (11항목)

1. 로그인 후 `user_devices`에 token 등록 (앱 설정 → 앱 푸시 등록)
2. Foreground 채팅 push 수신
3. Background 채팅 push 수신
4. Force-stop/killed 채팅 push 수신
5. Foreground 통화 → native call UI (Android Full Screen / iOS CallKit)
6. Killed 통화 → native call UI
7. 통화 cancel → 알림/CallKit dismiss
8. Missed call push
9. 로그아웃 후 push 미수신
10. `notification_deliveries`에 sent/skipped/failed 기록
11. Realtime만으로 killed 알림 처리하지 않음 (dispatch 경유)

## 권한·badge (실기기)

| # | 항목 | Android | iOS |
|---|------|---------|-----|
| P1 | 알림 권한 1회 허용 후 재요청 없음 | checkPermissions=granted | 동일 |
| P2 | 거부 시 OS 설정 안내 (반복 팝업 없음) | NativePushSettingsRow | 동일 |
| P3 | 카메라·마이크 통화 전 gate | call-permission | 동일 |
| P4 | 위치 — 필요 화면만 요청 | 배달/근처 진입 시 | 동일 |
| B1 | unread ↔ 아이콘 badge | @capawesome/capacitor-badge | 동일 |
| B2 | 로그아웃 badge 0 | clearNativeBadgeCount | 동일 |
| B3 | 계정 전환 A badge 제거 | disconnectNativeDevicesOnAccountSwitch | 동일 |

## 계정 전환

1. A 로그인 → push 등록
2. B로 전환 → A `user_devices` is_active=false (동일 device_id)
3. B push만 수신

## Android FCM 상태별 (2026-06)

| 앱 상태 | chat_message | incoming_call | missed_call |
|---------|--------------|---------------|-------------|
| foreground | 인앱만 (시스템 알림 X) | 웹 overlay (시스템 알림 X) | 인앱 센터 (시스템 알림 X) |
| background | 시스템 알림 + tap route | Full Screen → `IncomingCallActivity` | 시스템 알림 → logs?callId |
| killed | data-only 시스템 알림 | Full Screen 시도 | 시스템 알림 |
| locked | 알림 표시 | Activity wake + lockscreen UI | 알림 tap → logs |

## Android FCM QA (추가)

1. FCM token 등록 유지 (`user_devices`)
2. `chat_message` background tap → `/community-messenger/rooms/{roomId}`
3. killed 상태 tap → 앱 시작 후 route 이동 (`PushRouteListener`)
4. locked `incoming_call` → 화면 켜짐 (`IncomingCallActivity`)
5. accept → PATCH 1회 (`?action=accept`)
6. decline → native reject PATCH 1회
7. `expiresAt` 지난 incoming → UI 미표시
8. `missed_call` tap → `/community-messenger/calls/logs?callId=`
9. missed 알림에 다시 걸기 action 없음
10. foreground chat 시스템 알림 중복 없음
11. Android 12+ CallStyle — broadcast trampoline 없음 (Activity 직접 PendingIntent)
12. Android 13+ `POST_NOTIFICATIONS` 유지
13. `google-services.json` / `public/sw.js` diff 0

## Android logcat

```bash
adb logcat -s DIBAY_FCM DIBAY_INCOMING_CALL DIBAY_PUSH_ROUTE DIBAY_CALL_FLOW DIBAY_MISSED_CALL
```

## iOS Console

Xcode → Devices → Open Console → filter `VoIPPushRegistry` / `CallKitProvider`

## Admin 검증

- `/admin/push-devices` — user UUID 조회, 테스트 푸시
- delivery log에서 `push_provider`, `status` 확인
