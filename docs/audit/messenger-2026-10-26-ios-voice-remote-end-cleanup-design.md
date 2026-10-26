# iPhone 음성 — 상대가 끊으면 종료 정리가 끝나지 않음: 원인·수정 설계 (2026-10-26 12:50 PHT)

> 통화 변경 규정 적용. **Owner 승인 전 구현하지 않는다.** 확인된 사실만 쓴다.

## 1. 증상
- 연결된 음성 통화를 **상대(Samsung)가 끊으면** iPhone 에서 시스템 통화 화면이 다시 뜨고 종료음이 울림. iPhone 이 직접 끊으면 없음(Owner 실기기).
- iPhone 로그: 이런 통화마다 「정리 시작」만 있고 「정리 끝」·「소유 해제」·「화면 닫힘」 기록이 없음 — `d677`(10:06, 빌드 11), `a71f`·`8935`·`9ab9`(빌드 12). **오늘 수정 이전부터 있던 결함.**

## 2. 원인 — 확정 (기록 전용 빌드 `1.2 (13)` · `13d6a9764`, 12:40 `0967abd8`·`73b8f544`)

| 시각 (`0967`) | 기록 |
|---|---|
| 12:40:37.745 | `ios_diag_voice_agora_offline reason=0 main=true queue=com.apple.main-thread` — Agora 「상대 나감」 콜백(메인 스레드) |
| 12:40:37.746 | 상대 나감 처리 시작 → CallKit 종료 보고 → **콜백 안에서 그대로** 정리 시작 |
| 12:40:37.751 | `leave_enter` → `leave_locked hasEngine=true` |
| 12:40:37.757~.758 | `leave_channel_start` → `leave_channel_done` |
| 12:40:37.767 | **`engine_destroy_start` — 이후 `engine_destroy_done`·`leave_unlocked`·정리 다음 단계 기록 0건** |

- `73b8` 도 같은 순서·같은 지점에서 멈춤 (12:41:03.882 `engine_destroy_start` 이후 0건).
- 코드: `NativeVoiceCallAgoraEngine.rtcEngine(_:didOfflineOfUid:)` 가 리스너를 **동기 호출** → `NativeVoiceOutgoingCallCoordinator.onDisconnected` / `NativeVoiceIncomingCallCoordinator.onDisconnected` (`remote_offline=0` 분기) → `CallKitProvider.reportCallEnded` → `handleRemoteTerminal` → `cleanup` → `NativeVoiceCallAgoraEngine.leave` → `AgoraRtcEngineKit.destroy()` — **Agora SDK 콜백 안에서 엔진 destroy**.
- Agora 공식 문서: destroy 는 SDK 의 어떤 콜백 안에서도 호출하면 안 되며, 콜백이 끝날 때까지 자원을 놓지 못해 교착이 생길 수 있음 ([AgoraRtcEngineKit 3.x](https://api-ref.agora.io/en/voice-sdk/ios/3.x/Classes/AgoraRtcEngineKit.html), [Android 4.x](https://api-ref.agora.io/video-sdk/android/4.x/API/toc_initialize.html)).
- 영상은 같은 상대 나감 콜백에서도 정리가 끝남(`0120943a` 12:32:10 → `cleanup_done` 12:32:11.79) — 영상은 종료 서버 요청 응답 뒤(콜백 밖)에서 `leave` 가 실행됨.
- 사용자가 직접 끊는 음성(콜백 밖, CallKit 종료 동작)은 정리 정상(`cleanup_done` 기록 있음).

## 3. 종료음과의 관계
- 상대 종료 시 CallKit 종료 보고가 정리보다 먼저 나가고, 정리가 멈춰 통화 음성·오디오 세션 해제(`deactivateAfterNativeVoiceCall`)가 실행되지 않음. 영상 수신 상대 종료(`ee266b93`)는 연결 해제 **뒤** 같은 CallKit 보고 → 소리 없음.
- 종료음이 「오디오가 살아 있는 동안 CallKit 종료」 때문인지는 **NOT_PROVEN** — 이번 수정 후 같은 시험으로 판정. 남으면 별도 설계(한 번에 한 원인).

## 4. 수정 (iOS 1곳 · 통화만 · 단독 커밋)

| 파일 | 변경 |
|---|---|
| `ios/App/App/Call/NativeVoiceCallAgoraEngine.swift` | `didOfflineOfUid`·`didOccurError` 에서 리스너(`onDisconnected`·`onError`) 호출을 **`DispatchQueue.main.async` 로 다음 차례에 실행** — SDK 콜백이 먼저 끝난 뒤 정리·destroy 가 실행되게 함 |

- 같은 엔진의 다른 콜백(입장·연결 등)은 그대로. 영상 엔진·CallKit·서버·웹 무변경.
- 리스너는 이미 `peekOccupantCallId()`·런타임 상태를 확인하므로 한 차례 늦어져도 다른 통화를 처리하지 않음(사이에 `leave` 가 되면 `peekOccupantCallId` 가 nil 이라 무시).
- `didOccurError` 도 같은 경로(`fail` → `onError` → 정리 → destroy)라 함께 적용.
- 빌드: iOS `CURRENT_PROJECT_VERSION` 14. 기록 전용 줄(`ios_diag_*`)은 검증 끝날 때까지 유지.

## 5. 실기기 검증
1. iPhone→Samsung 음성, 10초 후 Samsung 종료 ×2 · Samsung→iPhone 음성, Samsung 종료 ×2 — `engine_destroy_done`·`cleanup_done`·`ui_dismissed` 기록, 화면 정상 종료, 종료음 여부 기록
2. 같은 조건 iPhone 종료 ×2 (회귀 없음)
3. 음성 거절·취소·재발신 각 1회 (회귀 없음)
