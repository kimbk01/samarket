# 알림음·진동 끔 반영 — 통화 영향 분석·계획 (2026-10-28 · 커밋 안 함)

Owner 승인: 2026-10-28 「Android 알림음·진동 끔은 3번(서버 소리·진동 표시)과 함께 진행 · 채널 레지스트리 변경 + 서버 표시 한 묶음 · 통화 행렬 실기 포함」.
FCM 수신 파일(`DibayFirebaseMessagingService.java`)은 바꾸지 않는다.

## 1. 원인 (코드 근거)
- 설정 게이트는 `sendPush` 만 쓰고 resolver 의 `playSound`·`vibrate` 를 버린다(`lib/notifications/web-push-user-settings-gate.ts`).
- iOS 일반 알림은 `aps.sound:"default"` 가 고정이다(`lib/push/dispatch/apns-sender-impl.ts` `buildApnsAlertBody`).
- Android 8+ 는 소리·진동이 채널에 고정되어 있는데, 메시지 채널은 전부 소리·진동 켬으로 만들어진다(`DibayNotificationChannelRegistry.ensureMessageChannel`).
- resolver 계약: `playSound=false` 이면 `vibrate=false` 다. 그래서 조합은 3가지뿐이다.
  - 기본
  - 진동 없음(소리 켬·진동 끔)
  - 무음(소리·진동 끔)

## 2. 바꾸는 파일·함수
| 파일 | 변경 |
|---|---|
| `lib/notifications/web-push-user-settings-gate.ts` | `resolveWebPushDeliveryForUser` 추가 — `{sendPush, playSound, vibrate}` 를 반환한다. `shouldSendWebPushForUser` 는 그 결과의 `sendPush` 만 돌려준다(캠페인 호출부 동작 그대로). |
| `lib/push/dispatch/push-sound-mode.ts` (신규) | `resolvePushSoundMode(decision)` → `"silent"`·`"no_vibrate"`·`null`. `withPushSoundMode(out, mode)` → meta 에 `push_sound_mode` 를 싣는다. |
| `lib/push/dispatch/dispatch-push-for-user.ts` | 게이트 결과로 sound mode 를 계산한다. **`callPush` 가 아닐 때만** meta 에 싣고, `notification_deliveries.provider_response.push_sound_mode` 에 기록한다. |
| `lib/push/dispatch/fcm-data-payload-contract.ts` | meta `push_sound_mode` 가 있고 통화 타입이 아닐 때만 FCM data `soundMode` 를 넣는다. |
| `lib/push/dispatch/apns-sender-impl.ts` | data `soundMode === "silent"` 이면 `aps.sound` 를 생략한다. |
| `android/.../DibayNotificationChannelRegistry.java` | 채널 2개를 등록한다: `dibay_msg_silent_v1`(소리 없음·진동 없음), `dibay_msg_novibrate_v1`(기본음·진동 없음). `resolveMessageChannelIdFromFcmData` 는 data `soundMode` 가 있으면 이 채널을 먼저 돌려준다. |

## 3. 통화 경로 무변경 근거
- **통화 푸시(수신·부재중·취소·거절·종료·다른 기기 응답)**: 서버가 meta 에 `push_sound_mode` 를 싣지 않는다(`callPush` 제외). 그래서 FCM data·APNs·VoIP payload 가 바이트 단위로 이전과 같다. 테스트로 고정한다.
- **`skip_settings_gate`·종료 신호**: 게이트를 돌지 않으므로 sound mode 가 없고, 지금과 같다.
- **Android**
  - 통화 수신·부재중은 `showMessageNotification` 을 거치지 않는다(별도 경로, 서비스 :90).
  - 통화 채널은 레지스트리의 `CALL_CHANNEL_IDS` 이고 이번 변경과 무관하다.
  - 새 채널 id 는 `dibay_calls_`·`dibay_native_` 접두가 아니다.
- **iOS**
  - VoIP(`voip-apns-sender-impl.ts`)는 바꾸지 않는다.
  - 부재중 일반 APNs 는 `buildApnsAlertBody` 를 같이 쓰지만 `soundMode` 가 없으므로 `aps.sound:"default"` 가 그대로다.

## 4. 영향받는 경로
- 일반 알림 푸시(채팅·거래·주문·배달·커뮤니티·공지)에서 알림음 끔·방해금지 시간·오너 선택 알림음 끔·매장 알림 끔인 경우:
  - Android 새 빌드: 무음 채널로 표시된다.
  - iOS: 무음으로 온다(서버 배포만으로 적용).
- 진동만 끔: Android 새 빌드는 진동 없는 채널로 표시된다. iOS 는 진동을 OS 설정이 정한다(Owner 결정).

## 5. 설치된 구 바이너리 호환
- Android 1.2.4 (13) 이하: `soundMode` 를 모르므로 무시한다. 지금처럼 기본 채널로 소리가 난다. 회귀는 없고 적용도 안 된다.
- iOS: 서버의 `aps.sound` 생략만으로 동작한다. 바이너리와 무관하다.

## 6. 회귀 위험·한계
- Android 7(API 24·25)은 채널이 없다. 서비스의 `setDefaults(DEFAULT_ALL)` 이 그대로 쓰이므로 무음이 적용되지 않는다(서비스 파일 무변경 조건).
- 진동만 끈 상태에서는 이벤트별 맞춤 알림음 채널(`dibay_ev_*`)을 쓰지 않고 기본음으로 울린다(채널은 소리·진동이 한 묶음).
- 무음 상태에서는 맞춤 알림음이 울리지 않는다(정상).
- 사용자가 OS 설정에서 새 채널을 바꾸면 그 설정이 우선한다(Android 규칙).

## 7. 롤백
- 서버: 커밋을 되돌리면 data `soundMode`·`aps.sound` 생략이 사라진다.
- Android: 서버가 `soundMode` 를 안 보내면 기존 채널을 쓴다. 이미 만든 채널 2개는 남지만 쓰이지 않는다.

## 8. 실기 검증 항목
- S1: 알림음 끔 → Android 새 빌드·iPhone 이 일반 알림을 소리·진동 없이 표시한다. DB `provider_response.push_sound_mode = "silent"`.
- S2: 진동만 끔 → Android 가 소리 있고 진동 없이 표시한다(`no_vibrate`).
- S3: 모두 켬 → 기존과 같다(`push_sound_mode` 없음).
- 통화 행렬 C1~C12 전체(AGENTS 통화 규정 5항). 통화 푸시의 `provider_response` 에 `push_sound_mode` 가 없음을 대조한다.

## 9. 남은 위험 처리 (2026-10-28 Owner 「남은 위험 모두 처리」 · 커밋 246c6553c)
| 위험 | 처리 |
|---|---|
| Android 7 무음 미적용 | FCM 수신 서비스의 일반 메시지 알림 builder `setDefaults` 한 줄만 `legacyNotificationDefaultsForFcmData(data)` 로 바꿨다. soundMode 가 없으면 `DEFAULT_ALL` 그대로이고, Android 8+ 는 채널이 우선하므로 무시된다. 통화 수신·부재중 경로는 이 함수를 거치지 않는다. |
| 진동 끔 + 맞춤 알림음 → 기본음 | 알림음 채널 저장소가 같은 음원의 진동 없음 변형 채널 `dibay_ev_<key>_v<n>_nv` 를 만든다. retire 때 함께 삭제한다. |
| 구 바이너리 1.2.4 (13) | 코드로 해결할 수 없다(구 앱은 soundMode 를 모름). 기존 장치로 처리한다: (14) 를 S·X 에 설치하고, Play 에 (14) 가 올라간 뒤 관리자 앱 설정 `android_min_version_code=14`(Play 인앱 즉시 업데이트)를 적용한다. 운영 설정 변경이라 Owner 승인이 필요하다. |
| iOS 서버 즉시 적용 | 부재중 일반 APNs 가 `aps.sound` 를 유지하는 것을 테스트로 고정했다. 실기 S4·S5·S6 와 통화 행렬에 iPhone 을 포함한다. |
