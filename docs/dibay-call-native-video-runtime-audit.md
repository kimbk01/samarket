# DIBAY Call Native Video Runtime Audit

## 목표 경로

최종 통화 성립 경로는 Voice/Video 모두 아래 순서여야 한다.

`Incoming -> Native Runtime -> Accept -> Native Token -> Native Agora -> Connected -> End`

Video 통화 성립 조건에 WebView, `CallV4Screen`, Agora JS, remote attach patch가 끼면 안 된다.

## 현재 감사 결론

- Android에는 `nativevideo/` 런타임이 아직 없다.
- 현재 Video 수락/연결은 `IncomingCallActivity` 또는 FCM route에서 `MainActivity`를 거쳐 `/community-messenger/calls-v4/*`로 이동하고, Web `CallV4Screen`에서 `call-v4-agora.ts`가 Agora JS join을 수행한다.
- Android native 준비물은 이미 일부 존재한다. `io.agora.rtc:full-sdk:4.6.3`, camera/mic permission, camera/mic foreground service permission, `CallForegroundService`의 camera/mic service type이 있다.
- Native Voice Runtime은 구조 재사용 대상이다. `NativeVoiceCallRuntime`, `NativeVoiceCallApi`, `NativeVoiceCallNotification`, `NativeVoiceCallService`, `NativeVoiceCallActionReceiver`, `NativeVoiceCallOwner` 패턴을 Video로 복제/확장할 수 있다.
- `eb3f377a`, `e65570f0`, `5cb81615` 계열 Web handoff 변경은 Native Video 대체 전까지 현재 동작 보존용 quarantine이다. 신규 속도 개선이나 token prefetch를 더 얹지 않는다.

## 재사용 대상

- Token/API: `NativeVoiceCallApi`의 PATCH accept/reject/end/missed와 token fetch HTTP 구조.
- Ownership: `NativeVoiceCallOwner`의 same-call duplicate block, terminal replay block, Web owner 차단 패턴.
- Lifecycle: `NativeVoiceCallRuntime`의 `RINGING -> ACCEPTING -> CONNECTING -> CONNECTED -> ENDING/ENDED/FAILED`.
- Notification/FSI: `NativeVoiceCallNotification`, `NativeVoiceCallActionReceiver`의 FSI와 action receiver 구조.
- Foreground service: `CallForegroundService`의 camera/mic service type 또는 Video 전용 service로 분리.
- Logging contract: `[DIBAY_NATIVE_VOICE]`와 같은 native-only marker 체계. Video는 `[DIBAY_NATIVE_VIDEO]`로 분리한다.

## 신규 필요 파일

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallLane.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallNotification.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActionReceiver.java`
- `scripts/verify-native-video-runtime-contract.cjs`

## MVP 구현 순서

1. Lane: `NativeVideoCallLane.shouldHandleIncoming(context, mediaType)`를 추가하고 `video`만 native video로 분기한다.
2. FCM: Video native lane이 켜진 call은 `/calls-v4` pending route 저장/주입을 하지 않고 `NativeVideoCallRuntime.handleIncoming()`으로 넘긴다.
3. UI: `NativeVideoCallActivity`는 WebView 없이 local preview container와 remote video container를 가진다.
4. Accept: notification/activity accept는 native PATCH accept 후 token fetch를 수행한다.
5. Agora: `RtcEngine.enableVideo()`, `setupLocalVideo()`, `startPreview()`, `publishCameraTrack=true`, `autoSubscribeVideo=true`, `onUserJoined/onFirstRemoteVideoDecoded`에서 remote view attach를 수행한다.
6. Connected: native Agora join success와 remote render 준비를 별도 로그로 남기고 `CONNECTED` 상태로 전환한다.
7. End: end/reject/missed는 native PATCH 후 Agora leave, service stop, notification dismiss, activity finish를 수행한다.
8. Contract: verify는 `nativevideo/`에서 `MainActivity`, `CallV4Screen`, `call-v4-agora`, `CallV4IntentHelper`, `CallRuntimeV4` 의존을 금지한다.

## PASS 기준

- Video accept 후 `MainActivity`, `CallV4Screen`, `joinCallV4Agora`, `call-v4-agora.ts` 없이 native 로그만으로 `state_connected`까지 도달한다.
- Local camera preview와 remote video view가 Android native view에 붙는다.
- 실패 시 Web handoff로 fallback하지 않고 native terminal cleanup으로 끝난다.
- Native Video connected QA가 PASS한 뒤에만 quarantine Web handoff를 제거한다.
