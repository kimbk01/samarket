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
    CAPPluginMethod(name: "bringActiveCallToFront", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "heartbeat", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportAppState", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getActiveCallSnapshot", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "reportRemoteEnded", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getCallTerminationPolicy", returnType: CAPPluginReturnPromise),
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

  /**
   * I2 (call-termination-authority-audit §3-2): 웹 endCall 은 Android 와 같은 규칙.
   * 서버 상태에서 온 사유만 상대 종료로 수렴하고(CONVERGE), 그 외(failed·정리·감시 타이머 등)는 살아 있는 통화를
   * 끝내지 않는다(WEB_REQUEST_UNCONFIRMED → KEEP). 이미 끝난 세션은 항상 정리. 웹은 사용자 종료를 서버 PATCH 후
   * 서버 상태 사유(ended 등)로 보낸다.
   */
  @objc func endCall(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    let reason = call.getString("reason") ?? "client_end"
    let cause = CallTerminationPolicy.causeForWebEndReason(reason)

    let videoOwned = NativeVideoCallOwner.isNativeOwned(callId: callId)
      || NativeVideoCallRuntime.shared.getSession(sessionId: callId) != nil
    let voiceOwned = !videoOwned
      && (NativeVoiceCallOwner.isNativeOwned(callId: callId)
        || NativeVoiceCallRuntime.shared.getSession(sessionId: callId) != nil)

    guard videoOwned || voiceOwned else {
      if cause != .webRequestUnconfirmed {
        call.resolve(["ok": true])
        return
      }
      let ok = DibayActiveCallSessionManager.shared.requestCleanup(reason: reason)
      if ok {
        DibayCallAudioSessionController.shared.deactivate()
      }
      call.resolve(["ok": ok])
      return
    }

    let phase = videoOwned
      ? CallTerminationPolicy.videoPhase(callId: callId)
      : CallTerminationPolicy.voicePhase(callId: callId)
    let decision = CallTerminationPolicy.decide(cause, phase)
    CallTerminationPolicy.log(
      callId, cause: cause, phase: phase, decision: decision,
      detail: "reason=\(reason) source=plugin_end_call runtime=\(videoOwned ? "video" : "voice")"
    )
    DibayCallLog.info(
      videoOwned ? "ios_native_video_end_call" : "ios_native_voice_end_call",
      sessionId: callId,
      detail: "reason=\(reason) decision=\(decision.rawValue)"
    )
    switch decision {
    case .keep:
      call.resolve(["ok": true, "kept": true])
    case .converge:
      if videoOwned {
        NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: callId)
      } else {
        NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: callId)
      }
      call.resolve(["ok": true])
    case .terminate:
      // 웹 사유는 TERMINATE 가 되지 않는다(판단표). 방어용 — 사용자 종료와 같은 경로.
      if videoOwned {
        NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: callId) {
          call.resolve(["ok": true])
        }
      } else {
        NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: callId) {
          call.resolve(["ok": true])
        }
      }
    }
  }

  /**
   * 기능 판별용 (call-termination-authority-audit §5): 이 메서드가 있는 앱은 Native Runtime 이 종료 판단 함수를 거친다.
   * 웹은 PluginHeaders 로 메서드 존재만 확인한다.
   */
  @objc func getCallTerminationPolicy(_ call: CAPPluginCall) {
    call.resolve(["version": 1, "webEndRequestUnconfirmedKeepsLiveCall": true])
  }

  private static func shouldReportOutgoingCallKit(sessionId: String, callKind: String) -> Bool {
    let kind = callKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard kind == "video" else { return true }
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    return NativeVideoCallOwner.isNativeOwned(callId: sid)
      || NativeVideoCallRuntime.shared.getSession(sessionId: sid) != nil
  }

  /**
   * 통화 중 다시 발신 버튼(1회 통화) — 새 통화 대신 진행 중인 네이티브 통화 화면을 앞으로.
   * 같은 세션을 다시 보여 줄 뿐 통화 상태·Agora 는 건드리지 않는다. shown=false 면 진행 중 통화 없음.
   */
  @objc func bringActiveCallToFront(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      let voice = NativeVoiceCallRuntime.shared.snapshot()
      if let session = voice.session, Self.isLiveVoicePhase(voice.phase) {
        // S3 — 통화 바 탭 = 사용자 복귀(줄인 상태 해제 후 표시).
        NativeVoiceCallUiHost.ensurePresented(
          callId: session.sessionId,
          session: session,
          bypassLockCheck: true,
          userRestore: true
        )
        call.resolve(["shown": true])
        return
      }
      let video = NativeVideoCallRuntime.shared.snapshot()
      if let session = video.session {
        switch video.state {
        case .ringing, .accepting, .connecting, .connected:
          // S3 — PiP 없이 줄인 화면은 사용자 복귀 경로, 그 외(PiP·표시 중)는 기존 PiP 복원 경로.
          if NativeVideoCallUiHost.isMinimizedWithoutPip(callId: session.sessionId) {
            NativeVideoCallUiHost.restoreFromUserMinimize(callId: session.sessionId) { ok in
              call.resolve(["shown": ok])
            }
            return
          }
          NativeVideoCallUiHost.restoreFullscreenFromPip(callId: session.sessionId) { ok in
            call.resolve(["shown": ok])
          }
          return
        case .ending, .ended, .failed:
          break
        }
      }
      call.resolve(["shown": false])
    }
  }

  private static func isLiveVoicePhase(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .incomingPresented, .outgoingStarting, .accepting, .accepted, .tokenPending, .joining, .connected:
      return true
    case .idle, .rejecting, .ending, .ended, .failed:
      return false
    }
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
    // I4: 웹의 「상대 종료」 알림은 Native Runtime 이 살아 있는 통화를 가진 경우 서버 상태로 확인한 뒤에만 수렴한다.
    // (기존: 살아 있는 Native 통화 중에도 오디오 세션을 비활성화 → 통화 무음.)
    let livePhase: CallTerminationPolicy.Phase = CallTerminationPolicy.runtimePhase(callId: callId)
    let isVideo: Bool = CallTerminationPolicy.videoPhase(callId: callId) != .none
    guard CallTerminationPolicy.isLive(livePhase) else {
      DibayActiveCallSessionManager.shared.onRemoteEnded(callId: callId)
      DibayCallAudioSessionController.shared.deactivate()
      call.resolve(["ok": true])
      return
    }
    CallTerminationPolicy.confirmServerTerminal(callId: callId, source: "plugin_report_remote_ended") { confirmed in
      CallTerminationPolicy.log(
        callId,
        cause: confirmed ? .peerTerminal : .webRequestUnconfirmed,
        phase: livePhase,
        decision: confirmed ? .converge : .keep,
        detail: "source=plugin_report_remote_ended"
      )
      DispatchQueue.main.async {
        if confirmed {
          if isVideo {
            NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: callId)
          } else {
            NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: callId)
          }
        }
        call.resolve(["ok": true, "kept": !confirmed])
      }
    }
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

  /// Member event eligibility + bound user — logout/guest must set false before VoIP presents CallKit.
  /// Atomic: eligible=true requires non-empty boundUserId (CUT7 terminated cold-wake contract).
  @objc func setMemberCallEligible(_ call: CAPPluginCall) {
    let eligible = call.getBool("eligible") ?? false
    let reason = (call.getString("reason") ?? "js_bridge").trimmingCharacters(in: .whitespacesAndNewlines)
    let boundUserId = (call.getString("boundUserId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let safeReason = reason.isEmpty ? "js_bridge" : reason
    let result = DibayMemberEventEligibilityStore.setMemberCallEligibility(
      eligible: eligible,
      boundUserId: boundUserId,
      reason: safeReason
    )
    call.resolve([
      "ok": true,
      "eligible": result.eligible,
      "boundUserSet": result.boundUserSet,
    ])
  }
}
