import Foundation

/**
 * D1 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §2) — 통화 플랫폼 능력 단일 정의.
 *
 * 같은 iOS 바이너리가 iPhone · iPad · Apple Silicon Mac(Designed for iPad)에서 실행된다.
 * 맥에서는 `userInterfaceIdiom == .pad` 라 기기 분류(`DibayDeviceClassClassifier`)로 구분할 수 없으므로
 * 통화 경로는 이 타입만 보고 갈라진다. 다른 곳에서 `isiOSAppOnMac` 를 직접 읽지 않는다.
 *
 * 맥 실측(2026-11-15 PHT, 1.2.2 (35)):
 * - VoIP 수신: macOS `callservicesd` 가 `BKSProcessAssertion … not supported on macOS` →
 *   `Dropping incoming message` 로 PushKit 푸시를 앱에 전달하지 않음.
 * - CallKit 발신: 트랜잭션은 성공하지만 `provider(_:didActivate:)` 가 오지 않아
 *   `ios_audio_session_gate_timeout`(8초)으로 발신 실패.
 *
 * 소비처: D3 — `DibayCallAudioSessionController.registerPendingOutgoingJoin`(맥 발신 오디오 gate).
 *         D3-2 — `CallKitProvider.reportOutgoingCallStarted`(맥 CallKit 발신 보고 생략).
 *         D2(수신·수락)는 승인 후 추가.
 */
enum DibayCallPlatformCapability {
  /// Apple Silicon Mac 에서 iOS 앱으로 실행 중인가.
  static var isIOSAppOnMac: Bool {
    ProcessInfo.processInfo.isiOSAppOnMac
  }

  /// PushKit VoIP 푸시가 앱까지 전달되는 플랫폼인가 (iPhone · iPad = true, Mac = false).
  static var supportsVoipPush: Bool {
    !isIOSAppOnMac
  }

  /// CallKit 이 `didActivate` 로 통화 오디오 세션을 넘겨주는 플랫폼인가 (iPhone · iPad = true, Mac = false).
  static var supportsCallKitAudioActivation: Bool {
    !isIOSAppOnMac
  }

  /// CallKit 에 통화를 보고(시스템 통화 UI)해도 되는 플랫폼인가 (iPhone · iPad = true, Mac = false).
  /// 맥 실측(2026-11-15 12:03 PHT, build 36): `CXStartCallAction` → callservicesd 가 FaceTime 실행 →
  /// FaceTime 이 표시할 것이 없어 즉시 종료 → `Disconnecting all calls because
  /// wantsCallDisconnectionOnInvalidation=YES` → 앱에 `CXEndCallAction` → 음성 발신 0.9초 만에 종료.
  static var supportsCallKitCallUi: Bool {
    !isIOSAppOnMac
  }

  static func logOnce() {
    guard !didLog else { return }
    didLog = true
    DibayCallLog.warn(
      "call_platform_capability",
      detail: "ios_app_on_mac=\(isIOSAppOnMac) voip_push=\(supportsVoipPush) callkit_audio_activation=\(supportsCallKitAudioActivation) callkit_call_ui=\(supportsCallKitCallUi)"
    )
  }

  private static var didLog = false
}
