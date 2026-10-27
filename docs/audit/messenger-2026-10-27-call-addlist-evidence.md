# 통화 추가 목록 증거 정리 — A-3 · A-10 · A-11 · A-14 (2026-10-27 PHT)

> 상태: **증거 정리만 · 수정 없음**. 통화 변경 규정에 따라 수정이 필요한 항목은 영향 분석·계획 문서 → Owner 승인 → 단독 커밋 → 실기기 행렬 순서로 한다.
> 기준: Production `ddfa36c6d` · iPhone 1.2 (15) · Samsung 1.2.4 (12). 운영 DB·기기 로그는 읽기만 했다.

## A-3 Samsung 이 전화를 받을 때 「띠딕」

- **이번 기록** (`29115c9c`, 10-27 08:02, iPhone→Samsung 음성, Samsung 자동 수락):
  - 08:02:39.785 수락.
  - 08:02:39.838 수신 알림을 **무음 교체본**으로 다시 올렸다(`notify(94326, channel=dibay_native_voice_incoming_v2, groupKey=silent)` — `NativeVoiceCallNotification.java:134`·`:193 setSilent(true)`).
  - 채널 설정: 소리 없음(`setSound(null)`), 진동 켬, 중요도 HIGH (`:293-299`).
  - 08:02:40.550 `call_answered_elsewhere` FCM 이 받은 기기 자신에게 왔지만 앱이 무시했다(`answered_elsewhere_ignored_winner`).
  - 08:02:41.654 연결 시점과 08:02:47.278 종료 시점에도 같은 알림 id 를 다시 올렸다(채널 진동 설정을 따름).
- **Owner 확인:** 08:02 시험에서 Samsung 이 받을 때 「띠딕」이 났다.
- **원인 (확정 — 기기 설정이 아니라 앱 채널 설정):**
  - 08:02:40.125 Samsung `RingtonePlayer` 가 `content://settings/system/notification_sound`(시스템 기본 알림음)를 재생했다. 같은 시각 통화 중 알림 `id=93001` 이 채널 `dibay_native_voice_call` 에 처음 올라갔다(08:02:39.859 `NativeVoiceCallService` CONNECTING 시작 직후).
  - 이 채널은 `NativeVoiceCallService.ensureChannel()` 에서 `IMPORTANCE_DEFAULT` 로 만들고 **`setSound(null, null)` 이 없다**. 알림 빌더도 `setSilent(true)` 없이 `setOnlyAlertOnce(true)` 만 있다 — 이것은 같은 id 를 **다시** 올릴 때만 소리를 막고, 첫 게시는 채널 소리를 낸다.
  - 영상(`NativeVideoCallService`, 채널 `dibay_native_video_call_v2`)은 `setSound(null, null)`·`enableVibration(false)`·빌더 `setSilent(true)` 가 있어 같은 문제가 없다.
  - `dumpsys notification` (10-27): Samsung·Xiaomi 모두 `dibay_native_voice_call` `mImportance=3 mSound=notification_sound` — **채널 설정은 두 기기가 같다.** Xiaomi 에서 안 들리는 것은 MIUI 의 알림음 처리 차이로 보인다(NOT_PROVEN). iPhone 은 이 Android 코드와 무관.
- **수정 후보** (통화 규정 — 계획서·승인 대상, 지금은 보류): 무음 채널을 새 id 로 만든다(기존 채널은 앱이 소리 설정을 바꿀 수 없음 — 영상이 `_v2` 로 바꾼 것과 같은 방식) + 빌더 `setSilent(true)`. **Android 네이티브 변경 → APK 재빌드.**

## A-10 iPhone 영상 직접 종료 시 `error_terminal`·정리 2회

- **기록:** `9cda6151`(10-26 20:44:53), `e6278456`(20:53:22), `3b8a875e`(10-27 05:52:48). 세 건 모두 같은 순서다.
  1. `ios_native_video_local_end`
  2. 약 50ms 뒤 `ios_native_video_end_call reason=ended path=native_video_runtime`
  3. `error_terminal reason=ended` → `owner_released reason=failed`
  4. `remote_terminal` 정리
  5. 1.2~1.4초 뒤 `local_end` 정리(CallKit `end_idempotent`)
- **원인 경로 (코드):**
  1. 직접 종료 → `beginEnd`(상태 `ending`) + 웹에 `local_end_begin` 알림 (`NativeVideoIncomingCallCoordinator.swift:249-252`).
  2. 웹이 이 알림으로 정리(`cleanupCallV4` → 네이티브 종료 호출, reason `ended`)하며 네이티브에 다시 종료를 보낸다.
  3. 플러그인이 `ended` 를 「상대 종료 정리」로 분류 (`NativeCallServicePlugin.swift:193`, `isRemoteTerminalCleanupReason` `:231-239`) → `handleRemoteTerminal`.
  4. 이미 `ending` 이라 `beginEnd` 가 실패하고, catch 에서 `markFailed(.ended)` 가 호출된다 (`:289-294`, `NativeVideoCallRuntime.swift:189-203`).
  5. 원래 종료 요청의 응답 뒤 `local_end` 정리가 한 번 더 돈다.
- **영향 (관측):** 통화는 정상 종료되고 화면도 닫혔다. 기록상 「실패」로 남고 정리·CallKit 종료가 2회 실행된다. 음성은 같은 경로에서 `callkit_end_idempotent` 만 남고 실패로 표시되지 않는다.
- **수정 후보** (통화 규정 — 계획서 대상):
  - (a) 네이티브: 이미 종료 중(`ending`)인 통화에 대한 상대 종료 정리는 아무것도 하지 않는다. **네이티브 변경 → iOS 재빌드.**
  - (b) 웹: 네이티브가 먼저 알린 직접 종료(`local_end_begin`)를 정리할 때는 네이티브로 종료를 되돌려 보내지 않는다. 웹만 변경.
  - 정확한 웹 호출 줄은 계획 단계에서 WebView 기록으로 확정한다.

## A-11 Samsung→iPhone VoIP 25.8초 늦게 도착 (`13808383`, 10-26)

- **도착 지연 분포**(서버 `notification_deliveries.created_at` sent → iPhone `[voip] received`):
  - 10-26 저녁~10-27 4건: `345bdaab` 0.90초 · `e6278456` 0.87초 · `66ffaf5f` 1.58초 · `99e3838f` 5.43초.
  - 앞서 10-26 9건: 0.8~4.9초 · `13808383` 25.8초 1건.
- **서버 발송 설정:** `apns-push-type: voip` · `apns-priority: 10` · `apns-expiration: 0` (`apns-sender-impl.ts:101-111`). 서버는 HTTP 200 을 받았다.
- **판단:**
  - 앱·서버 쪽 원인 근거가 없다. 발송 뒤 APNs → 기기 전달 구간의 변동으로 본다(NOT_PROVEN: Apple 쪽 기록 없음).
  - 재현되지 않았다. 지연 분포는 계속 기록한다.
  - 수정 대상 아님(현재 증거 기준).

## A-14 정상 종료 직후 재발신 시 iPhone 발신 화면 4.6초 지연 (`e8516a45`, 10-26)

- **재시험 2회 모두 재현 안 됨:**
  - 10-27 06:06 `e8516a45`: 세션 생성 → 네이티브 시작 0.4초.
  - 10-27 08:02 `f9c969ac`: 재발신 누름 08:02:50.33 → 세션 생성 50.98~52.60(**1.62초**) → 네이티브 넘김 52.60~52.73 → 발신 화면 52.62.
- **10-26 지연 구간:** 서버 세션 생성(43.0) 뒤 → iPhone 네이티브 시작(47.6). 이 구간의 웹 단계 기록이 없어 원인은 NOT_PROVEN.
- **관측:** 정상일 때도 「재발신 누름 → 화면」 대부분(1.4~1.6초)은 서버 세션 생성 요청 시간이다. 지연 재현 시 비교할 기준값으로 남긴다.
- **판단:** 재현 전에는 수정하지 않는다. 지금은 WebView 단계별 기록 수단이 갖춰져 있어 다음 재현 때 구간을 특정할 수 있다.

## 정리

| 항목 | 상태 | 다음 |
|---|---|---|
| A-3 | 원인 확정: 음성 통화 중 알림 채널에 소리 설정이 남아 있음(앱 코드) · Samsung 만 재생 | 보류(Owner 10-27) · 다음 Android 빌드 때 계획서 → 승인 |
| A-10 | 원인 경로 확정(코드·로그 3건) · 기능 영향 없음(기록·정리 2회) | 수정 시 계획서 → 승인 (웹 (b) 우선 — 재빌드 없음) |
| A-11 | 앱·서버 원인 근거 없음 · 재현 안 됨 | 기록 유지 |
| A-14 | 재현 안 됨(2회) · 구간 특정 수단 준비됨 | 재현 시 구간 확정 |
