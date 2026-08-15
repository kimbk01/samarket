import Capacitor
import Foundation

/** P4 — lib/call/native/native-call-service.ts */
@objc(NativeCallServicePlugin)
public class NativeCallServicePlugin: CAPPlugin, CAPBridgedPlugin {
  static let eventNativeCallConnected = "nativeCallConnected"
  static let eventNativeCallTerminal = "nativeCallTerminal"

  private static var connectedEmitted = Set<String>()
  private static var terminalEmitted = Set<String>()
  private static var pendingTerminalPayloads: [JSObject] = []
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
    CAPPluginMethod(name: "isNativeVideoOutgoingLaneEnabled", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isNativeVoiceIncomingLaneEnabled", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestCallMediaPermissions", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "checkCallMediaPermissions", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "persistCanonicalDeviceId", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setMemberCallEligible", returnType: CAPPluginReturnPromise),
  ]

  public override func load() {
    super.load()
    NativeCallServicePlugin.pluginInstance = self
    NativeCallServicePlugin.flushPendingTerminalEmits(using: self)
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

  /** Local/remote native terminal — immediate Web idle so re-dial is not blocked by async cleanup. */
  static func publishNativeTerminal(callId: String, reason: String, source: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    guard terminalEmitted.insert(sid).inserted else { return }

    var payload = JSObject()
    payload["callId"] = sid
    payload["reason"] = reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "ended" : reason
    payload["source"] = source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "native_terminal" : source
    payload["nativeOwned"] = true
    emitNativeCallTerminal(payload)
  }

  static func clearNativeTerminalEmit(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    terminalEmitted.remove(sid)
  }

  private static func emitNativeCallTerminal(_ payload: JSObject) {
    guard let plugin = pluginInstance else {
      pendingTerminalPayloads.append(payload)
      DibayCallLog.info("ios_native_terminal_emit_deferred", detail: "pending_count=\(pendingTerminalPayloads.count)")
      return
    }
    flushPendingTerminalEmits(using: plugin)
    plugin.notifyListeners(eventNativeCallTerminal, data: payload)
  }

  private static func flushPendingTerminalEmits(using plugin: NativeCallServicePlugin) {
    guard !pendingTerminalPayloads.isEmpty else { return }
    let queue = pendingTerminalPayloads
    pendingTerminalPayloads.removeAll()
    for payload in queue {
      plugin.notifyListeners(eventNativeCallTerminal, data: payload)
    }
    DibayCallLog.info("ios_native_terminal_emit_flushed", detail: "count=\(queue.count)")
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
    DibayActiveCallSessionManager.shared.bindActiveCall(callId: callId, mediaType: kind, phase: "CONNECTED")
    DibayCallAudioSessionController.shared.activateForCall(video: kind == "video")
    if Self.shouldReportOutgoingCallKit(sessionId: callId, callKind: kind) {
      CallKitProvider.shared.reportOutgoingCallStarted(sessionId: callId, hasVideo: kind == "video")
      DibayCallLog.infoCall("ios_callkit_call_started", callId: callId)
    } else {
      DibayCallLog.infoCall(
        "ios_callkit_call_started_skipped",
        callId: callId,
        detail: "reason=video_no_native_establishment"
      )
    }
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

    if Self.isRemoteTerminalCleanupReason(reason) {
      let voiceOwned = NativeVoiceCallOwner.isNativeOwned(callId: callId)
        || NativeVoiceCallRuntime.shared.getSession(sessionId: callId) != nil
      let videoOwned = NativeVideoCallOwner.isNativeOwned(callId: callId)
        || NativeVideoCallRuntime.shared.getSession(sessionId: callId) != nil
      if !voiceOwned && !videoOwned {
        call.resolve(["ok": true])
        return
      }
    }

    if NativeVideoCallOwner.isNativeOwned(callId: callId)
      || NativeVideoCallRuntime.shared.getSession(sessionId: callId) != nil
    {
      DibayCallLog.info(
        "ios_native_video_end_call",
        sessionId: callId,
        detail: "reason=\(reason) path=native_video_runtime"
      )
      if Self.isRemoteTerminalCleanupReason(reason) {
        NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: callId)
        call.resolve(["ok": true])
        return
      }
      NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: callId) {
        call.resolve(["ok": true])
      }
      return
    }

  // Native Voice Runtime owns outgoing/incoming establishment — DibayActiveCallSessionManager is legacy sync.
    if NativeVoiceCallOwner.isNativeOwned(callId: callId)
      || NativeVoiceCallRuntime.shared.getSession(sessionId: callId) != nil
    {
      DibayCallLog.info(
        "ios_native_voice_end_call",
        sessionId: callId,
        detail: "reason=\(reason) path=native_voice_runtime"
      )
      if Self.isRemoteTerminalCleanupReason(reason) {
        NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: callId)
        call.resolve(["ok": true])
        return
      }
      NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: callId) {
        call.resolve(["ok": true])
      }
      return
    }

    let ok = DibayActiveCallSessionManager.shared.requestCleanup(reason: reason)
    if ok {
      DibayCallAudioSessionController.shared.deactivate()
    }
    call.resolve(["ok": ok])
  }

  private static func isRemoteTerminalCleanupReason(_ reason: String) -> Bool {
    switch reason.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
    case "rejected", "declined", "cancelled", "canceled", "missed", "failed",
         "ended", "remote_ended", "peer_busy", "remote_terminal", "native_stale_terminal":
      return true
    default:
      return false
    }
  }

  private static func shouldReportOutgoingCallKit(sessionId: String, callKind: String) -> Bool {
    let kind = callKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard kind == "video" else { return true }
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    return NativeVideoCallOwner.isNativeOwned(callId: sid)
      || NativeVideoCallRuntime.shared.getSession(sessionId: sid) != nil
  }

  @objc func getActiveCallId(_ call: CAPPluginCall) {
    if let runtimeId = NativeVoiceCallRuntime.shared.snapshot().session?.sessionId {
      let sid = runtimeId.trimmingCharacters(in: .whitespacesAndNewlines)
      if !sid.isEmpty {
        call.resolve(["callId": sid])
        return
      }
    }
    if NativeVideoCallLane.isEnabled(),
       let videoId = NativeVideoCallRuntime.shared.snapshot().session?.sessionId
    {
      let sid = videoId.trimmingCharacters(in: .whitespacesAndNewlines)
      if !sid.isEmpty {
        call.resolve(["callId": sid])
        return
      }
    }
    if let managerId = DibayActiveCallSessionManager.shared.callId {
      let sid = managerId.trimmingCharacters(in: .whitespacesAndNewlines)
      if !sid.isEmpty {
        call.resolve(["callId": sid])
        return
      }
    }
    if let callkitId = CallKitProvider.shared.getActiveCallSessionId() {
      call.resolve(["callId": callkitId])
      return
    }
    call.resolve(["callId": NSNull()])
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
    if NativeVideoCallLane.isOutgoingVideoLaneActive(mediaType: mediaType) {
      NativeVideoCallApi.startCallerJoinAsync(
        callId: callId,
        roomId: roomId,
        peerUserId: peerUserId,
        peerName: peerName,
        mediaType: mediaType
      )
      let nativeOwned = NativeVideoCallOwner.isNativeOwned(callId: callId)
      call.resolve(["ok": nativeOwned, "nativeOwned": nativeOwned])
      return
    }
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
    call.resolve([
      "owned": NativeVoiceCallOwner.isNativeOwned(callId: callId)
        || NativeVideoCallOwner.isNativeOwned(callId: callId),
    ])
  }

  @objc func isNativeVideoOutgoingLaneEnabled(_ call: CAPPluginCall) {
    let enabled = NativeVideoCallLane.isOutgoingVideoLaneActive(mediaType: "video")
    call.resolve(["enabled": enabled])
  }

  @objc func isNativeVoiceOutgoingLaneEnabled(_ call: CAPPluginCall) {
    DibayCallLog.info("ios_native_outgoing_lane_check_received")
    let enabled = NativeVoiceCallLane.isOutgoingVoiceLaneActive(mediaType: "voice")
    DibayCallLog.info("ios_native_outgoing_lane_check_resolving", detail: "enabled=\(enabled)")
    call.resolve(["enabled": enabled])
  }

  @objc func isNativeVoiceIncomingLaneEnabled(_ call: CAPPluginCall) {
    let enabled = NativeVoiceCallLane.isEnabled()
    call.resolve(["enabled": enabled])
  }

  @objc func checkCallMediaPermissions(_ call: CAPPluginCall) {
    let snap = DibayVideoMediaPermission.snapshot()
    call.resolve([
      "microphone": snap.microphone,
      "camera": snap.camera,
    ])
  }

  @objc func requestCallMediaPermissions(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let kind = (call.getString("callKind") ?? "voice").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let context = DibayVoiceMicrophonePermission.resolveIncomingAnswerContext()

    let complete: (Bool) -> Void = { granted in
      let snap = DibayVideoMediaPermission.snapshot()
      call.resolve([
        "ok": granted,
        "callKind": kind,
        "microphone": snap.microphone,
        "camera": kind == "video" ? snap.camera : "granted",
      ])
    }

    if kind == "video" {
      DibayVideoMediaPermission.ensureGranted(sessionId: callId, context: context, completion: complete)
      return
    }
    DibayVoiceMicrophonePermission.ensureGranted(sessionId: callId, context: context, completion: complete)
  }

  @objc func persistCanonicalDeviceId(_ call: CAPPluginCall) {
    let deviceId = (call.getString("deviceId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !deviceId.isEmpty else {
      call.reject("invalid_device_id")
      return
    }
    DibayCanonicalDeviceIdStore.save(deviceId)
    call.resolve(["ok": true])
  }

  /// Member event eligibility projection — logout/guest must set false before VoIP presents CallKit.
  @objc func setMemberCallEligible(_ call: CAPPluginCall) {
    let eligible = call.getBool("eligible") ?? false
    let reason = (call.getString("reason") ?? "js_bridge").trimmingCharacters(in: .whitespacesAndNewlines)
    DibayMemberEventEligibilityStore.setEligible(eligible, reason: reason.isEmpty ? "js_bridge" : reason)
    call.resolve(["ok": true, "eligible": eligible])
  }
}
