# Native push rollout report (template)

날짜: ___________  
담당: ___________  
빌드: Android ___ / iOS ___

## 환경

| 변수 | 설정 |
|------|------|
| PUSH_DISPATCH_ENABLED | |
| FCM_SERVICE_ACCOUNT_JSON | yes/no |
| APNS_KEY_P8 | yes/no |
| APNS_VOIP_TOPIC | |

## Android 실기기 (PASS/FAIL)

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | Foreground 채팅 push | | |
| 2 | Background 채팅 push | | |
| 3 | Killed 채팅 push | | |
| 4 | Killed 통화 Full Screen | | |
| 5 | Call cancel dismiss | | |
| 6 | Missed call | | |
| 7 | Logout 후 미수신 | | |
| 8 | Deep link `dibay://chat/{roomId}` | | |
| 9 | `notification_deliveries` sent | | |
| 10 | logcat 캡처 첨부 | | |

## iOS 실기기 (PASS/FAIL)

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | Foreground 채팅 push (APNS) | | |
| 2 | Background 채팅 push | | |
| 3 | Killed 채팅 push | | |
| 4 | VoIP + CallKit incoming | | |
| 5 | Call cancel CallKit end | | |
| 6 | Missed call | | |
| 7 | Logout 후 미수신 | | |
| 8 | Deep link `dibay://call/{sessionId}` | | |
| 9 | `notification_deliveries` sent | | |
| 10 | Xcode Console 캡처 | | |

## Delivery 샘플 (최근 3건)

```
(paste JSON)
```

## 종합 판정

- PR-2 Android: PASS / FAIL  
- PR-3 iOS: PASS / FAIL  
- PR-4 Admin/E2E: PASS / FAIL  

## 미해결 / 후속

- 
