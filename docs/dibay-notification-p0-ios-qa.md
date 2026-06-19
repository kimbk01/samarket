# DIBAY Notification P0 — iOS 실기기 QA 기준

Android APK PASS만으로 **Notification P0 전체 완료를 선언하지 않습니다.**

| 플랫폼 | 상태 표현 |
|--------|-----------|
| Android (APK) | `Android P0 PASS` / `Android P0 NOT VERIFIED` |
| iOS (iPhone) | `iOS P0 PASS` / `iOS P0 NOT VERIFIED` |
| 전체 | **Android PASS + iOS PASS** 모두 충족 시에만 `Notification P0 complete` |

## iOS 검증 환경

- **Chrome / Safari 웹 QA 금지** — TestFlight 또는 dev IPA on iPhone 실기기
- APNS token → `user_devices` (`push_provider=apns` 또는 `voip_apns`)
- Xcode Devices Console: `VoIPPushRegistry`, CallKit, push route 로그
- Admin: `/admin/push-devices` delivery `status=sent`

## iOS 필수 3종 상태 (Android와 동일 제품 기준)

| # | 상태 | PASS 기준 |
|---|------|-----------|
| 1 | **앱 안 foreground** | same-room suppress / in-app outside room |
| 2 | **앱 밖 background / normal killed** | APNS 수신 → 알림 표시 → badge ↑ |
| 3 | **기기 잠금 lock screen** | 잠금화면 알림 + sound 1회 + badge ↑ |

> iOS **force-quit(사용자 강제 종료)** 는 Android `am force-stop`과 유사하게 OS 정책 한계가 있을 수 있음. 별도 `4B` 항목으로 문서화하고 P0 필수에서 제외 가능.

## iOS 시나리오 체크리스트

| # | 시나리오 | PASS |
|---|----------|------|
| 1 | Foreground outside room | event + badge |
| 2 | Same room foreground suppress | push suppressed |
| 3 | Background | APNS + notification |
| 4A | Normal killed/cold | APNS + notification |
| 4B | Force-quit (if OS blocks) | known limitation only |
| 5 | Lock screen | notification + sound + badge |
| 6 | Notification tap deeplink | **native app** opens room (Safari/Chrome = FAIL) |
| 7 | Room read / badge clear | read_at + badge ↓ |
| 8 | Missed voice call | missed_call event + APNS |
| 9 | Missed video call | 동일 |
| 10 | Call history read | missed badge clear + read_at |

## iOS 완료 보고 필수 항목

- iPhone 기기 모델 / iOS 버전
- 로그인 계정 (qqqq 등) + `user_devices` active row
- APNS permission granted
- `notification_events` / `notification_deliveries sent` SQL
- badge-count before/after
- deeplink가 **native app**으로 열렸는지 (Safari FAIL)
- read_at / opened_at
- scenario 1~10 PASS/FAIL 표

## 현재 상태 (2026-06-19)

| 플랫폼 | 상태 |
|--------|------|
| **Android APK** | scenarios **1–3, 4A, 5–10 PASS** · scenario **4B** = `android-force-stop-limitation` (P0 필수 제외) |
| **iOS iPhone** | **NOT VERIFIED** |

**표현:** `Android P0 PASS (4B OS limitation 문서화)` · `iOS P0 NOT VERIFIED` · **전체 Notification P0 complete 금지** (iOS 실기기 PASS 전)
