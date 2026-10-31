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
    CAPPluginMethod(name: "replayLastVoipToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportCallEnded", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "claimForegroundWebIncomingOwner", returnType: CAPPluginReturnPromise),
  ]

  @objc func startVoipRegistration(_ call: CAPPluginCall) {
    VoIPPushRegistry.shared.start()
    call.resolve(["started": true])
  }

  /// A7 / CALL-7: JS VoIP listener attach 후 캐시된 PushKit 토큰을 1회 재전달.
  @objc func replayLastVoipToken(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      DibayPushTokenBridge.replayLastVoipTokenIfPresent()
      call.resolve(["ok": true])
    }
  }

  @objc func reportCallEnded(_ call: CAPPluginCall) {
    guard let sessionId = call.getString("sessionId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !sessionId.isEmpty
    else {
      call.reject("session_required", "sessionId is required")
      return
    }
    // I4: 살아 있는 Native 통화는 서버 상태로 확인된 종료만 받는다. 이미 끝난(또는 모르는) 세션은 그대로 정리.
    let live: Bool = CallTerminationPolicy.isLive(CallTerminationPolicy.runtimePhase(callId: sessionId))
    guard live else {
      CallKitProvider.shared.reportCallEnded(uuidString: sessionId)
      call.resolve(["ok": true])
      return
    }
    CallTerminationPolicy.confirmServerTerminal(callId: sessionId, source: "voip_plugin_report_call_ended") { confirmed in
      DispatchQueue.main.async {
        if confirmed {
          CallKitProvider.shared.reportCallEnded(uuidString: sessionId)
        }
        call.resolve(["ok": true, "kept": !confirmed])
      }
    }
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
