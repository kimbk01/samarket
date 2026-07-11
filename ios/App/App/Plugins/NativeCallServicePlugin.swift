import Capacitor
import Foundation

/** P4 — lib/call/native/native-call-service.ts */
@objc(NativeCallServicePlugin)
public class NativeCallServicePlugin: CAPPlugin, CAPBridgedPlugin {
  static let eventNativeCallConnected = "nativeCallConnected"

  private static var connectedEmitted = Set<String>()
  private static weak var pluginInstance: NativeCallServicePlugin?

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
    CAPPluginMethod(name: "acquireScreenAwake", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "releaseScreenAwake", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "notifyScreenAwakePresentation", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "startNativeOutgoingEstablishment", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isNativeEstablishmentOwned", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isNativeVoiceOutgoingLaneEnabled", returnType: CAPPluginReturnPromise),
  ]

  public override func load() {
    super.load()
    NativeCallServicePlugin.pluginInstance = self
  }

  /** O3 — idempotent native connected publish (Android `publishNativeConnected` parity). */
  static func publishNativeConnected(
    callId: String,
    roomId: String,
    mediaType: String,
    direction: String,
    peerUserId: String,
    peerName: String,
    runtime: String,
    fgsOwner: String
  ) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    guard connectedEmitted.insert(sid).inserted else { return }

    let managerMedia = mediaType.lowercased() == "video" ? "video" : "voice"
    var payload = JSObject()
    payload["callId"] = sid
    payload["roomId"] = roomId
    payload["mediaType"] = managerMedia
    payload["direction"] = direction
    payload["peerUserId"] = peerUserId
    payload["peerName"] = peerName
    payload["connectedAtMs"] = Int(Date().timeIntervalSince1970 * 1000)
    payload["nativeOwned"] = true
    payload["runtime"] = runtime
    payload["fgsOwner"] = fgsOwner
    payload["source"] = "native_connected_bridge"
    emitNativeCallConnected(payload)
  }

  static func clearNativeConnectedEmit(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    connectedEmitted.remove(sid)
  }

  private static func emitNativeCallConnected(_ payload: JSObject) {
    guard let plugin = pluginInstance else { return }
    plugin.notifyListeners(eventNativeCallConnected, data: payload)
  }

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
    if NativeVoiceCallOwner.isNativeOwned(callId: callId) {
      DibayCallLog.infoCall("ios_callkit_start_idempotent", callId: callId, detail: "reason=native_owned")
      call.resolve(["ok": true])
      return
    }
    DibayActiveCallSessionManager.shared.bindActiveCall(callId: callId, mediaType: kind, phase: "CONNECTED")
    DibayCallAudioSessionController.shared.activateForCall(video: kind == "video")
    CallKitProvider.shared.reportOutgoingCallStarted(sessionId: callId, hasVideo: kind == "video")
    DibayCallLog.infoCall("ios_callkit_call_started", callId: callId)
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

  @objc func acquireScreenAwake(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let reason = call.getString("reason") ?? "connected_video"
    ScreenAwakeBridge.shared.acquire(callId: callId, reason: reason)
    call.resolve(["ok": true])
  }

  @objc func releaseScreenAwake(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let reason = call.getString("reason") ?? "cleanup"
    ScreenAwakeBridge.shared.release(callId: callId, reason: reason)
    call.resolve(["ok": true])
  }

  @objc func notifyScreenAwakePresentation(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let presentation = call.getString("presentation") ?? "unknown"
    ScreenAwakeBridge.shared.notifyPresentationChanged(callId: callId, presentation: presentation)
    call.resolve(["ok": true])
  }

  @objc func startNativeOutgoingEstablishment(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let roomId = call.getString("roomId") ?? ""
    let mediaType = call.getString("mediaType") ?? "voice"
    let peerUserId = call.getString("peerUserId") ?? ""
    let peerName = call.getString("peerName") ?? ""
    guard NativeVoiceCallLane.isOutgoingVoiceLaneActive(mediaType: mediaType) else {
      call.resolve(["ok": false, "nativeOwned": false])
      return
    }
    NativeVoiceCallApi.startCallerJoinAsync(
      callId: callId,
      roomId: roomId,
      peerUserId: peerUserId,
      peerName: peerName,
      mediaType: mediaType
    )
    let nativeOwned = NativeVoiceCallOwner.isNativeOwned(callId: callId)
    call.resolve(["ok": nativeOwned, "nativeOwned": nativeOwned])
  }

  @objc func isNativeEstablishmentOwned(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    call.resolve(["owned": NativeVoiceCallOwner.isNativeOwned(callId: callId)])
  }

  @objc func isNativeVoiceOutgoingLaneEnabled(_ call: CAPPluginCall) {
    NSLog("[DIBAY_CALL] ios_native_outgoing_lane_check_received")
    let enabled = NativeVoiceCallLane.isOutgoingVoiceLaneActive(mediaType: "voice")
    NSLog("[DIBAY_CALL] ios_native_outgoing_lane_check_resolving enabled=%@", enabled ? "true" : "false")
    call.resolve(["enabled": enabled])
  }
}
