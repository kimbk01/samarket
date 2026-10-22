import Capacitor
import Foundation

/**
 * iOS VoIP call bridge skeleton.
 *
 * Production path:
 * - PushKit token registration is owned by VoIPPushRegistry.
 * - CallKit UI is owned by CallKitProvider.
 * - This plugin exposes minimal JS hooks for token refresh and explicit call lifecycle sync.
 */
@objc(DibayVoipCallPlugin)
public class DibayVoipCallPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayVoipCallPlugin"
  public let jsName = "DibayVoipCall"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "startVoipRegistration", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportCallEnded", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "claimForegroundWebIncomingOwner", returnType: CAPPluginReturnPromise),
  ]

  @objc func startVoipRegistration(_ call: CAPPluginCall) {
    VoIPPushRegistry.shared.start()
    // 통화 정상화 계획 v2 §3-2 (C5) — 웹 리스너가 준비된 뒤 호출된다. 앱 시작 직후 발급돼 웹이 놓친 VoIP 토큰을
    // 다시 전달한다(기존 재시도는 15초 후 멈춤 → 재설치 직후 토큰 등록 지연).
    DispatchQueue.main.async {
      DibayPushTokenBridge.replayLastVoipTokenIfPresent()
    }
    call.resolve(["started": true])
  }

  @objc func reportCallEnded(_ call: CAPPluginCall) {
    guard let sessionId = call.getString("sessionId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !sessionId.isEmpty
    else {
      call.reject("session_required", "sessionId is required")
      return
    }
    CallKitProvider.shared.reportCallEnded(uuidString: sessionId)
    call.resolve(["ok": true])
  }

  @objc func claimForegroundWebIncomingOwner(_ call: CAPPluginCall) {
    guard let sessionId = call.getString("sessionId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !sessionId.isEmpty
    else {
      call.reject("session_required", "sessionId is required")
      return
    }
    let reason = call.getString("reason")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "ios_foreground_fcm_wake"
    DispatchQueue.main.async {
      let claimed = CallV4SurfaceOwnerBridge.claimForegroundWebInAppIfActive(callId: sessionId, reason: reason)
      call.resolve(["claimed": claimed])
    }
  }
}
