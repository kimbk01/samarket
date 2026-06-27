# DIBAY Call Native Video Runtime Audit

## 목표 경로

최종 통화 성립 경로는 Voice/Video 모두 아래 순서여야 한다.

`Incoming -> Native Runtime -> Accept -> Native Token -> Native Agora -> Connected -> End -> Cleanup`

Video 통화 성립 조건에 WebView, `CallV4Screen`, Agora JS, remote attach patch가 끼면 안 된다.

## 현재 상태 (2026-06-27)

- Android `nativevideo/` 런타임 구현 완료. FCM → `NativeVideoCallRuntime.handleIncoming()` → `NativeVideoCallActivity` → native PATCH/token → `NativeVideoCallAgoraEngine` (Agora Android SDK 4.6.3).
- `nativeVideoRuntime=true` in `dibay-call-lane.json`. Video incoming은 Web pending-route / V4 handoff 없이 native lane만 사용.
- **Lifecycle Fast QA LOCK** — Steps 1–9 PASS on real devices (see `docs/dibay-call-native-video-runtime-qa.md`).
- Quarantine Web handoff (`MainActivity` `/calls-v4`)는 Native Video 대체 검증 완료 전까지 유지. LOCK은 lifecycle QA 범위만 확장하지 않는다.

## 재사용 대상

- Token/API: `NativeVoiceCallApi` 패턴 → `NativeVideoCallApi`
- Ownership: `NativeVideoCallOwner` (`duplicate_runtime_blocked`, terminal replay block)
- Lifecycle: `NativeVideoCallRuntime` states + Voice-parity incoming surface paths
- Notification/FSI: `NativeVideoCallNotification`, `NativeVideoCallActionReceiver`
- Foreground service: `NativeVideoCallService` (camera|microphone|phoneCall)
- Logging: `[DIBAY_NATIVE_VIDEO]` marker vocabulary

## 구현 파일 (SSOT)

- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallLane.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallAgoraEngine.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallNotification.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActionReceiver.java`
- `android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallOutgoingEntry.java`
- `scripts/verify-native-video-runtime-contract.cjs`

## Lifecycle product fixes (LOCK bundle)

| Issue | Fix |
|-------|-----|
| Rotation re-creates Activity / Agora rejoin | Manifest `configChanges` + `onConfigurationChanged` |
| End hang when `remote_video_rendered` | Main-thread Agora teardown after `clearVideoSurfaces` |

## PASS 기준 (lifecycle LOCK)

- Native logs only through `state_connected` and end/cleanup (no Web establishment).
- Local preview + remote video on native surfaces.
- End → `cleanup_done` → `owner_released`; FGS stopped.
- 30s cleanup hold: no rejoin, no call UI, no video activity top-resumed.
- Redial with new callId after cleanup.
- Duplicate FCM same-callId replay blocked via `duplicate_runtime_blocked`.

## 다음 단계 (LOCK 밖)

- PiP / Dock / presentation layer
- Quarantine Web handoff 제거 (별도 승인)
- iOS / Windows contract implementation
