# A-3 수정 계획 — Android 음성 통화 중 알림 무음 채널 (2026-10-27 PHT)

> 상태: **계획 · Owner 승인 대기**. 통화 변경 규정 3번에 따라 승인 후 구현한다.
> 증거: `messenger-2026-10-27-call-addlist-evidence.md` §A-3.

## 1. 원인 (증거)

- 통화 `29115c9c` (10-27 08:02, iPhone→Samsung 음성):
  - Samsung 수락 08:02:39.785.
  - 08:02:39.859 `NativeVoiceCallService` 가 CONNECTING 으로 시작하고, 통화 중 알림 `id=93001` 을 채널 `dibay_native_voice_call` 에 처음 올렸다.
  - 08:02:40.125 `RingtonePlayer` 가 시스템 기본 알림음을 재생했다 → Owner 가 들은 「띠딕」.
- 채널을 만드는 코드 `NativeVoiceCallService.ensureChannel()`:
  - `IMPORTANCE_DEFAULT` 로 만들고, `setSound(null, null)` 이 없다.
  - 그래서 채널 소리 = 기본 알림음이다. `dumpsys` 확인: Samsung·Xiaomi 모두 `mSound=notification_sound`.
- 알림 빌더에는 `setOnlyAlertOnce(true)` 만 있다.
  - 이것은 같은 id 를 **다시** 올릴 때만 소리를 막는다. 처음 올릴 때는 채널 소리가 난다.
- 영상은 이미 고쳐져 있다. `27af5a38a` (08-31) 에서 `dibay_native_video_call_v2` 무음 채널과 빌더 `setSilent(true)` 를 넣었다. 음성만 남아 있었다.
- 영향 범위:
  - 이 알림은 **Android 음성 통화의 수신(받기)·발신 모두** CONNECTING 시점에 처음 올라간다.
  - 발신 쪽에서도 같은 소리가 날 수 있다(로그로는 미확인).
  - 쓰지 않는 `startRinging` 경로는 호출처가 없다.

## 2. 변경 (Android 네이티브만 · 1개 원인)

| 파일 | 변경 |
|---|---|
| `android/.../nativevoice/NativeVoiceCallService.java` | `CHANNEL_ID` 를 `dibay_native_voice_call` 에서 **`dibay_native_voice_call_v2`** 로 바꾼다. 옛 id 는 `LEGACY_CHANNEL_ID` 로 표시만 하고 새 알림은 올리지 않는다(영상과 같은 방식). |
| 같은 파일 `ensureChannel()` | 새 채널을 `IMPORTANCE_DEFAULT` 그대로 만들되 `setSound(null, null)`, `enableVibration(false)`, `setShowBadge(false)` 를 넣는다. |
| 같은 파일 `buildNotification()` | 빌더에 `setSilent(true)` 를 추가한다. `setOnlyAlertOnce`·우선순위·CallStyle(끊기 버튼)·통화 화면 복귀는 그대로 둔다. |
| `android/.../DibayNotificationChannelRegistry.java` | `CALL_CHANNEL_IDS` 에 `dibay_native_voice_call_v2` 를 추가한다. 이 id 는 접두어 규칙으로도 이미 통화 채널로 분류된다. |
| `lib/call/__tests__/native-voice-fgs-channel-v2-contract.test.ts` (신규) | 영상 계약 테스트와 같은 형식으로 v2 id·무음 설정을 검사한다. |

- **왜 새 id 인가:** 이미 만들어진 채널의 소리는 앱이 바꿀 수 없다(Android 규칙). 그래서 기존 설치 기기도 새 id 라야 무음이 된다.
- **바뀌지 않는 것:**
  - 웹·서버·iOS 코드.
  - 수신벨 채널(`dibay_native_voice_incoming_v2`).
  - FCM·VoIP 발송, 세션·상태·종료 흐름.
  - 포그라운드 서비스 시작 순서. `ensureChannel()` 이 `startForeground` 보다 먼저 실행되는 것은 그대로다.

## 3. 영향받는 경로

| 경로 | 영향 |
|---|---|
| 음성 수신 → 받기(CONNECTING·CONNECTED 알림) | 소리·진동 없음 (이것이 목적) |
| 음성 발신(CONNECTING·CONNECTED 알림) | 소리·진동 없음 |
| 상태바 통화 표시·알림창 「통화 중」·끊기 버튼·눌러서 통화 화면 복귀 | 그대로. 중요도는 DEFAULT 로 같다. |
| 수신벨·수신 화면·거절·취소·부재중·busy·타임아웃 | 변경 없음. 다른 채널·코드다. |
| 영상 | 변경 없음 |
| iPhone | 변경 없음 (Android 코드만) |

## 4. 설치된 구 바이너리 호환

- 웹·서버 변경이 없어서, 구 APK(1.2.4 (12) 이하)와 iOS 는 동작이 그대로다.
- 새 APK 를 설치하면 첫 음성 통화 때 v2 채널이 생긴다.
  - 옛 채널은 시스템 설정에 「DIBAY Native Voice」 로 남지만 쓰이지 않는다.
  - 영상 v1 이 남아 있는 것과 같다.

## 5. 회귀 위험과 대응

- 채널이 없는 상태로 `startForeground` 하면 앱이 죽는다.
  - 대응: `ensureChannel()` 이 같은 함수에서 먼저 실행된다(변경 없음).
  - 테스트에서 `CHANNEL_ID` 가 v2 하나로만 쓰이는지 검사한다.
- 사용자가 시스템에서 옛 채널 설정을 바꿔 둔 경우, 그 설정은 새 채널로 이어지지 않는다. 기본값이 무음이라 문제없다.

## 6. 롤백

- 커밋을 되돌리고 APK 를 다시 빌드·설치한다. 웹 배포에는 영향이 없다.

## 7. 빌드·배포

- `[배포 구분]` 네이티브 (Android) — APK 재빌드·설치가 필요하다.
  - 목표 버전: Android 1.2.4 (**13**) — 빌드할 때 `native:prepare` 로 1회 올린다.
  - iOS 는 빌드하지 않는다.
- 설치 방법: 9단계와 같다. 같은 debug 키로 `assembleDebug` 후 `adb install -r -t`. Samsung·Xiaomi 둘 다 Claude 가 adb 로 설치할 수 있다.
- 단독 커밋 → main 반영. android 파일은 웹 빌드 생략 목록에 없어 Vercel 배포가 한 번 돌지만, 웹 동작은 바뀌지 않는다.

## 8. 실기기 검증 (설치 버전 `user_devices.app_version` 1.2.4 (13) 확인 후)

| # | 시험 | 판정 |
|---|---|---|
| 1 | iPhone→Samsung 음성 · Samsung 받기 | 띠딕 **없음** · logcat 에 `RingtonePlayer` 재생 없음 · 알림 채널 `..._v2` |
| 2 | Samsung→iPhone 음성 발신 | 발신·연결 때 알림음 없음 |
| 3 | 통화 중 Samsung 알림창 | 「통화 중」 표시·끊기 버튼으로 종료·눌러서 통화 화면 복귀 |
| 4 | Xiaomi 받기 (iPhone→Xiaomi) | 소리 없음 · 정상 연결 |
| 5 | 통화 규정 최소 행렬 | Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소(재울림 없음), busy, 무응답 타임아웃, 종료 후 즉시 재발신 |

## 9. 결과 (10-27 PHT)

- 구현: `10b4791c7` (A-3 단독) · 빌드 번호 `ce7b962f4` (Android versionCode 13) · main 반영.
- 설치: Samsung `user_devices.app_version` = 1.2.4 (13) (08:23:41 PHT). iPhone 1.2 (15) 그대로.
- Xiaomi: 정식 서명본 1.2.4 (11) 이 설치돼 있어 debug APK 로 덮어쓰기 불가(앱 삭제 금지) → **NOT_PROVEN**.

| # | 시험 | callId | 서버(운영 DB) | 결과 |
|---|---|---|---|---|
| 1 | iPhone→Samsung 음성, Samsung 받기 | `f8ba5256` | 생성 08:25:20.97 · 응답 :26.57 · 종료 :43.80 | PASS — 첫 게시 채널 `_v2` SILENT, `RingtonePlayer` 0회, Owner 「소리 안남」 |
| 2 | Samsung→iPhone 음성 | `ddfe84b6` | 생성 08:27:20.05 · 응답 :29.01 · 종료 08:28:03.27 | PASS — 발신·연결 알림 무음 |
| 3 | iPhone→Samsung 영상 | `7c25ea82` | 생성 08:28:58.04 · 응답 08:29:03.57 · 종료 :21.37 | PASS — 회귀 없음 |
| 4 | Samsung 거절 | `4c02bf91` | rejected 08:31:11.17 | PASS — iPhone 「통화 거절됨」 |
| (추가) | Samsung 직접 받기 | `f231533f` | 응답 08:32:32.76 · 종료 :39.86 | PASS — 소리 없음 |
| 5 | 벨 중 취소 ×3 | `15d2cb42`·`098ea866`·`92f359cd` | cancelled 08:33:19.90 · :26.71 · :31.79 | PASS — 벨 0.1초 안 멈춤, 재울림 없음 |
| 6 | 무응답 → 부재중 | `0c38e39b` | missed 08:35:05.36 | PASS — Samsung 벨 08:35:06.95 멈춤, 재울림 없음 |
| 7 | Samsung→iPhone 30초 유지 | `dbd16e0a` | 응답 08:35:59.06 · 종료 08:36:31.37 | PASS — 알림 10회 재게시 모두 SILENT |
| 8 | 종료 직후 재발신 | `fdaf1bda` → `a2d74a7b` | 종료 08:37:31.67 → 재생성 :35.18 · 응답 :40.64 · 종료 :42.77 | PASS |

- 전 구간 Samsung `RingtonePlayer` 재생 0회 (수정 전 08:02 시험: 받을 때 1회).
- busy(3번째 기기가 통화 중인 사람에게 거는 시험)는 이번에 하지 않았다 — NOT_PROVEN. 이번 변경은 알림 채널 소리만 바꿔 busy 판정 경로와 무관.
- 관찰(범위 밖·기존): 받기 직후 수신 알림 무음 교체본이 `No Channel found … dibay_native_voice_incoming_v2` 로 거부된다(수정 전 08:02 로그에도 동일). 수신벨·수신 화면은 정상.
