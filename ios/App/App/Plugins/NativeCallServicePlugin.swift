import Capacitor
import Foundation

/** P4 — lib/call/native/native-call-service.ts */
@objc(NativeCallServicePlugin)
public class NativeCallServicePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "NativeCallServicePlugin"
  public let jsName = "NativeCallService"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "prepareAccept", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "startCall", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getActiveCallId", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "heartbeat", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportAppState", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getActiveCallSnapshot", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportRemoteEnded", returnType: CAPPluginReturnPromise),
  ]

  @objc func prepareAccept(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let kind = call.getString("callKind") ?? "voice"
    DibayActiveCallSessionManager.shared.bindActiveCall(callId: callId, mediaType: kind, phase: "ACCEPTED")
    DibayCallAudioSessionController.shared.activateForCall(video: kind == "video")
    call.resolve(["ok": true])
  }

  @objc func startCall(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let kind = call.getString("callKind") ?? "voice"
    DibayActiveCallSessionManager.shared.bindActiveCall(callId: callId, mediaType: kind, phase: "CONNECTED")
    DibayCallAudioSessionController.shared.activateForCall(video: kind == "video")
    CallKitProvider.shared.reportOutgoingCallStarted(sessionId: callId, hasVideo: kind == "video")
    NSLog("[DIBAY_CALL] ios_callkit_call_started callId=%@", callId)
    call.resolve(["ok": true])
  }

  @objc func endCall(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let reason = call.getString("reason") ?? "client_end"
    let ok = DibayActiveCallSessionManager.shared.requestCleanup(reason: reason)
    if ok {
      DibayCallAudioSessionController.shared.deactivate()
    }
    call.resolve(["ok": ok])
  }

  @objc func getActiveCallId(_ call: CAPPluginCall) {
    let active = DibayActiveCallSessionManager.shared.callId ?? CallKitProvider.shared.getActiveCallSessionId()
    call.resolve(["callId": active as Any])
  }

  @objc func heartbeat(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    DibayActiveCallSessionManager.shared.recordHeartbeat(callId: callId)
    call.resolve(["ok": true])
  }

  @objc func reportAppState(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let state = call.getString("state") ?? "foreground"
    switch state {
    case "background":
      DibayActiveCallSessionManager.shared.onAppBackground()
    case "screen_off":
      DibayActiveCallSessionManager.shared.onScreenLocked()
    default:
      DibayActiveCallSessionManager.shared.onAppForeground()
    }
    call.resolve(["ok": true])
  }

  @objc func getActiveCallSnapshot(_ call: CAPPluginCall) {
    let snap = DibayActiveCallSessionManager.shared.snapshot()
    call.resolve(snap)
  }

  @objc func reportRemoteEnded(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    DibayActiveCallSessionManager.shared.onRemoteEnded(callId: callId)
    DibayCallAudioSessionController.shared.deactivate()
    call.resolve(["ok": true])
  }
}
