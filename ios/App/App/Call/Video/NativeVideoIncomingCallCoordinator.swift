import Foundation

/**
 * Phase B4 — Incoming video establishment coordinator.
 * Owns Accept → Token → Agora join → Connected / cleanup. CallKit wiring stays in B5.
 */
final class NativeVideoIncomingCallCoordinator: NativeVideoCallAgoraEngineListener {
  static let shared = NativeVideoIncomingCallCoordinator()

  private static let connectingTimeoutSeconds: TimeInterval = 12

  private let syncQueue = DispatchQueue(label: "com.dibay.app.native-video-incoming-coordinator")
  private var answerGenerationBySession: [String: UInt64] = [:]
  private var agoraGenerationBySession: [String: UInt64] = [:]
  private var cleanupInFlight: Set<String> = []
  private var callkitFulfilled: Set<String> = []
  private var connectingTimeoutWorkItem: DispatchWorkItem?

  private init() {}

  // MARK: - Answer

  func handleAnswer(
    sessionId: String,
    completion: @escaping (_ fulfill: Bool) -> Void
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(false)
      return
    }

    log("ios_native_video_answer_started", sid)

    do {
      try NativeVideoCallRuntime.shared.beginAccept(sessionId: sid)
    } catch let error as NativeVideoCallRuntimeError {
      if case .duplicateAction = error {
        log("ios_native_video_begin_accept_duplicate", sid)
        completion(true)
        return
      }
      abortAnswerFailure(
        sessionId: sid,
        marker: "video_accept_fail_begin",
        terminalReason: "failed",
        terminalSource: "begin_accept_failed",
        reportCallKitEnded: true,
        serverAction: "reject",
        completion: completion
      )
      return
    } catch {
      abortAnswerFailure(
        sessionId: sid,
        marker: "video_accept_fail_begin",
        terminalReason: "failed",
        terminalSource: "begin_accept_failed",
        reportCallKitEnded: true,
        serverAction: "reject",
        completion: completion
      )
      return
    }

    log("ios_native_video_permission_check_started", sid)
    let micContext = DibayVoiceMicrophonePermission.resolveIncomingAnswerContext()
    DibayVideoMediaPermission.ensureGranted(sessionId: sid, context: micContext) { [weak self] granted in
      guard let self else { return }
      guard self.isStillAccepting(sessionId: sid) else {
        self.abortStaleAnswer(
          sessionId: sid,
          stage: "permission",
          completion: completion
        )
        return
      }
      if !granted {
        self.failBeforeFulfill(
          sessionId: sid,
          generation: NativeVideoCallRuntime.shared.currentGeneration(),
          reason: .missingCameraOrMicrophonePermission,
          failMarker: "video_accept_fail_permission",
          serverAction: "reject",
          completion: completion
        )
        return
      }
      self.log("ios_native_video_permission_granted", sid)
      self.continueAnswerAfterPermissions(sessionId: sid, completion: completion)
    }
  }

  private func continueAnswerAfterPermissions(
    sessionId: String,
    completion: @escaping (_ fulfill: Bool) -> Void
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(false)
      return
    }
    guard isStillAccepting(sessionId: sid) else {
      abortStaleAnswer(sessionId: sid, stage: "continue_after_permission", completion: completion)
      return
    }

    let runtimeGen = NativeVideoCallRuntime.shared.currentGeneration()
    syncQueue.sync { answerGenerationBySession[sid] = runtimeGen }

    log("ios_native_video_accept_started", sid)
    NativeVideoCallApi.acceptAsync(callId: sid) { [weak self] ok, status, error in
      guard let self else { return }
      guard self.isCurrentAnswer(sessionId: sid, generation: runtimeGen) else {
        self.log("ios_native_video_stale_callback_ignored", sid, "stage=accept")
        return
      }
      if !ok {
        let err = error ?? ""
        if err.contains("answered_elsewhere") {
          self.log("ios_native_video_answered_elsewhere", sid, "status=\(status)")
          CallKitProvider.shared.reportCallEnded(uuidString: sid)
          completion()
          return
        }
        self.log("ios_native_video_accept_failed", sid, "status=\(status) err=\(err)")
        self.failBeforeFulfill(
          sessionId: sid,
          generation: runtimeGen,
          reason: .acceptFailed,
          failMarker: "video_accept_fail_patch",
          serverAction: "reject",
          completion: completion
        )
        return
      }

      do {
        try NativeVideoCallRuntime.shared.markConnecting(sessionId: sid)
      } catch {
        self.failBeforeFulfill(
          sessionId: sid,
          generation: runtimeGen,
          reason: .internalInvariant,
          failMarker: "video_accept_fail_patch",
          serverAction: "end",
          completion: completion
        )
        return
      }

      self.log("ios_native_video_token_started", sid)
      NativeVideoCallApi.fetchTokenAsync(callId: sid) { [weak self] connection, tokenError in
        guard let self else { return }
        guard self.isCurrentAnswer(sessionId: sid, generation: runtimeGen) else {
          self.log("ios_native_video_stale_callback_ignored", sid, "stage=token")
          return
        }
        guard let connection else {
          self.log("ios_native_video_token_failed", sid, "err=\(tokenError ?? "")")
          self.failBeforeFulfill(
            sessionId: sid,
            generation: runtimeGen,
            reason: .tokenFailed,
            failMarker: "video_accept_fail_token",
            serverAction: "end",
            completion: completion
          )
          return
        }
        self.log("ios_native_video_token_ok", sid)

        self.log("ios_native_video_agora_join_started", sid)
        let join = NativeVideoCallAgoraEngine.shared.join(
          callId: sid,
          token: connection,
          listener: self
        )
        guard join.ok else {
          self.log("ios_native_video_accept_failed", sid, "err=\(join.error ?? "join_failed")")
          self.failBeforeFulfill(
            sessionId: sid,
            generation: runtimeGen,
            reason: .joinFailed,
            failMarker: "video_accept_fail_join",
            serverAction: "end",
            completion: completion
          )
          return
        }
        self.syncQueue.sync { self.agoraGenerationBySession[sid] = join.generation }

        DibayCallAudioSessionController.shared.prepareForNativeVideoCall()
        self.scheduleConnectingTimeout(sessionId: sid, generation: runtimeGen)

        self.syncQueue.sync { self.callkitFulfilled.insert(sid) }
        self.log("ios_native_video_callkit_fulfilled", sid)
        completion(true)
      }
    }
  }

  // MARK: - Reject / End / Terminal

  func handleRejectOrEnd(sessionId: String, completion: @escaping () -> Void) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion()
      return
    }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard let active = snap.session, active.sessionId == sid else {
      completion()
      return
    }

    switch snap.state {
    case .ringing, .accepting:
      do { try NativeVideoCallRuntime.shared.beginReject(sessionId: sid) } catch { /* best-effort */ }
      NativeVideoCallApi.rejectAsync(callId: sid) { [weak self] _, _, _ in
        do { try NativeVideoCallRuntime.shared.markRejected(sessionId: sid) } catch { /* */ }
        self?.cleanup(
          sessionId: sid,
          reason: "reject",
          terminalReason: "rejected",
          terminalSource: "local_reject",
          reportCallKitEnded: false,
          serverAction: nil
        )
        completion()
      }
    case .connecting, .connected:
      NativeVideoCallUiHost.publishPipEndActionIfNeeded(callId: sid)
      log("ios_native_video_local_end", sid, "state=\(snap.state)")
      do { try NativeVideoCallRuntime.shared.beginEnd(sessionId: sid) } catch { /* */ }
      NativeVideoCallBridge.publishLocalTerminal(sessionId: sid, reason: "ended", source: "local_end_begin")
      NativeVideoCallApi.endAsync(callId: sid) { [weak self] _, _, _ in
        do { try NativeVideoCallRuntime.shared.markEnded(sessionId: sid) } catch { /* */ }
        self?.cleanup(
          sessionId: sid,
          reason: "local_end",
          terminalReason: "ended",
          terminalSource: "local_end",
          reportCallKitEnded: false,
          serverAction: nil
        )
        completion()
      }
    default:
      cleanup(
        sessionId: sid,
        reason: "end_idle",
        terminalReason: "ended",
        terminalSource: "end_idle",
        reportCallKitEnded: false,
        serverAction: nil
      )
      completion()
    }
  }

  func handleRemoteTerminal(sessionId: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard snap.session?.sessionId == sid else { return }
    do {
      try NativeVideoCallRuntime.shared.beginEnd(sessionId: sid)
      try NativeVideoCallRuntime.shared.markEnded(sessionId: sid)
    } catch {
      try? NativeVideoCallRuntime.shared.markFailed(sessionId: sid, reason: .ended)
    }
    log("ios_native_video_remote_terminal", sid, "state=\(snap.state)")
    cleanup(
      sessionId: sid,
      reason: "remote_terminal",
      terminalReason: "remote_ended",
      terminalSource: "remote_terminal",
      reportCallKitEnded: false,
      serverAction: nil
    )
  }

  // MARK: - Agora Listener

  func onConnected() {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let gen = syncQueue.sync { agoraGenerationBySession[sid] }
    guard let gen, NativeVideoCallAgoraEngine.shared.matches(callId: sid, generation: gen) else {
      log("ios_native_video_stale_callback_ignored", sid, "stage=connected")
      return
    }
    cancelConnectingTimeout()
    do {
      try NativeVideoCallRuntime.shared.markConnected(sessionId: sid)
      log("ios_native_video_connected", sid)
      DibayActiveCallSessionManager.shared.bindActiveCall(callId: sid, mediaType: "video", phase: "CONNECTED")
      NativeVideoCallAgoraEngine.shared.attachLocalPreviewIfUiReady(callId: sid)
      NativeVideoCallBridge.publishConnectedState(sessionId: sid, source: "incoming_agora_connected")
    } catch {
      log("ios_native_video_stale_callback_ignored", sid, "stage=mark_connected")
    }
  }

  func onRemoteVideoReady() {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    log("ios_native_video_remote_render_ready", sid)
    DispatchQueue.main.async {
      _ = NativeVideoCallUiHost.ensureVideoRootForRemoteRender(callId: sid)
      NativeVideoCallAgoraEngine.shared.onRemoteRenderSurfaceReady(callId: sid)
    }
  }

  func onDisconnected(reason: String) {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    switch snap.state {
    case .ending, .ended, .failed:
      return
    default:
      break
    }
    let normalized = reason.lowercased()
    if snap.state == .connected, normalized.contains("remote_offline") {
      handleRemoteTerminal(sessionId: sid)
      return
    }
    failAfterFulfill(
      sessionId: sid,
      reason: .mediaFailed,
      failMarker: "video_accept_fail_join",
      serverAction: "end"
    )
  }

  func onError(reason: String) {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let fulfilled = syncQueue.sync { callkitFulfilled.contains(sid) }
    if fulfilled {
      failAfterFulfill(
        sessionId: sid,
        reason: .joinFailed,
        failMarker: "video_accept_fail_join",
        serverAction: "end"
      )
    } else {
      let runtimeGen = syncQueue.sync { answerGenerationBySession[sid] } ?? 0
      failBeforeFulfill(
        sessionId: sid,
        generation: runtimeGen,
        reason: .joinFailed,
        failMarker: "video_accept_fail_join",
        serverAction: "end",
        completion: { _ in }
      )
    }
  }

  // MARK: - Fail / Cleanup

  private func failBeforeFulfill(
    sessionId: String,
    generation: UInt64,
    reason: NativeVideoCallFailure,
    failMarker: String,
    serverAction: String?,
    completion: @escaping (Bool) -> Void
  ) {
    guard isCurrentAnswer(sessionId: sessionId, generation: generation) else {
      log("ios_native_video_stale_callback_ignored", sessionId, "stage=fail_before")
      return
    }
    log(failMarker, sessionId, "reason=\(String(describing: reason))")
    log("ios_native_video_callkit_failed", sessionId, "reason=\(String(describing: reason))")
    try? NativeVideoCallRuntime.shared.markFailed(sessionId: sessionId, reason: reason)
    cleanup(
      sessionId: sessionId,
      reason: "fail_before_fulfill",
      terminalReason: terminalReason(for: reason),
      terminalSource: failMarker,
      reportCallKitEnded: true,
      serverAction: serverAction
    )
    completion(false)
  }

  private func failAfterFulfill(
    sessionId: String,
    reason: NativeVideoCallFailure,
    failMarker: String,
    serverAction: String?
  ) {
    log(failMarker, sessionId, "reason=\(String(describing: reason))")
    log("ios_native_video_cleanup_started", sessionId, "reason=\(String(describing: reason))")
    try? NativeVideoCallRuntime.shared.markFailed(sessionId: sessionId, reason: reason)
    cleanup(
      sessionId: sessionId,
      reason: "fail_after_fulfill",
      terminalReason: terminalReason(for: reason),
      terminalSource: failMarker,
      reportCallKitEnded: true,
      serverAction: serverAction
    )
  }

  private func abortAnswerFailure(
    sessionId: String,
    marker: String,
    terminalReason: String,
    terminalSource: String,
    reportCallKitEnded: Bool,
    serverAction: String?,
    completion: @escaping (Bool) -> Void
  ) {
    log(marker, sessionId)
    try? NativeVideoCallRuntime.shared.markFailed(sessionId: sessionId, reason: .invalidSession)
    cleanup(
      sessionId: sessionId,
      reason: marker,
      terminalReason: terminalReason,
      terminalSource: terminalSource,
      reportCallKitEnded: reportCallKitEnded,
      serverAction: serverAction
    )
    completion(false)
  }

  private func abortStaleAnswer(
    sessionId: String,
    stage: String,
    completion: @escaping (Bool) -> Void
  ) {
    log("ios_native_video_stale_callback_ignored", sessionId, "stage=\(stage)")
    let snap = NativeVideoCallRuntime.shared.snapshot()
    if snap.session?.sessionId == sessionId, snap.state == .accepting {
      abortAnswerFailure(
        sessionId: sessionId,
        marker: "video_accept_fail_stale",
        terminalReason: "failed",
        terminalSource: "stale_callback_\(stage)",
        reportCallKitEnded: true,
        serverAction: "reject",
        completion: completion
      )
      return
    }
    completion(false)
  }

  private func scheduleConnectingTimeout(sessionId: String, generation: UInt64) {
    cancelConnectingTimeout()
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      guard self.isCurrentAnswer(sessionId: sid, generation: generation) else { return }
      let snap = NativeVideoCallRuntime.shared.snapshot()
      guard snap.session?.sessionId == sid, snap.state == .connecting else { return }
      self.log("video_accept_fail_join_hang", sid, "timeout_s=\(Int(Self.connectingTimeoutSeconds))")
      self.failAfterFulfill(
        sessionId: sid,
        reason: .joinFailed,
        failMarker: "video_accept_fail_join_hang",
        serverAction: "end"
      )
    }
    syncQueue.sync { connectingTimeoutWorkItem = work }
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.connectingTimeoutSeconds, execute: work)
  }

  private func cancelConnectingTimeout() {
    syncQueue.sync {
      connectingTimeoutWorkItem?.cancel()
      connectingTimeoutWorkItem = nil
    }
  }

  private func cleanup(
    sessionId: String,
    reason: String,
    terminalReason: String,
    terminalSource: String,
    reportCallKitEnded: Bool,
    serverAction: String?
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let shouldRun: Bool = syncQueue.sync {
      if cleanupInFlight.contains(sid) { return false }
      cleanupInFlight.insert(sid)
      return true
    }
    guard shouldRun else { return }

    cancelConnectingTimeout()
    log("ios_native_video_cleanup_started", sid, "reason=\(reason)")

    if let serverAction {
      if serverAction == "end" {
        NativeVideoCallApi.endAsync(callId: sid) { _, _, _ in }
      } else if serverAction == "reject" {
        NativeVideoCallApi.rejectAsync(callId: sid) { _, _, _ in }
      }
    }

    NativeVideoCallBridge.publishLocalTerminal(sessionId: sid, reason: terminalReason, source: terminalSource)
    NativeVideoCallBridge.clearConnectedPublish(callId: sid)
    NativeCallServicePlugin.clearNativeTerminalEmit(callId: sid)

    NativeVideoCallAgoraEngine.shared.leave(reason: reason, notifyListener: false)
    DibayCallAudioSessionController.shared.deactivate()

    // UI teardown on main FIFO: stopPip → clearSurfaces → dismiss (P4 — no main.sync from background).
    DispatchQueue.main.async {
      if !sid.isEmpty {
        NativeVideoCallUiHost.stopPipBeforeDismiss(callId: sid)
        NativeVideoCallUiHost.clearVideoSurfaces(callId: sid)
        NativeVideoCallUiHost.finishIfActive(callId: sid)
      }
      NativeVideoCallRuntime.shared.reset(sessionId: sid)
      if DibayActiveCallSessionManager.shared.callId == sid {
        DibayActiveCallSessionManager.shared.clearSession()
      }
      if reportCallKitEnded {
        CallKitProvider.shared.reportCallEnded(uuidString: sid)
      } else {
        CallKitProvider.shared.endCallKitSession(
          sessionId: sid,
          reason: .remoteEnded,
          logDetail: reason
        )
      }
      self.syncQueue.async {
        self.answerGenerationBySession.removeValue(forKey: sid)
        self.agoraGenerationBySession.removeValue(forKey: sid)
        self.callkitFulfilled.remove(sid)
        self.cleanupInFlight.remove(sid)
        self.log("ios_native_video_cleanup_done", sid, "reason=\(reason)")
      }
    }
  }

  private func terminalReason(for failure: NativeVideoCallFailure) -> String {
    switch failure {
    case .missingCameraOrMicrophonePermission, .rejected:
      return "rejected"
    case .acceptFailed, .tokenFailed, .joinFailed, .mediaFailed, .invalidSession, .internalInvariant:
      return "failed"
    case .ended:
      return "ended"
    default:
      return "failed"
    }
  }

  private func isCurrentAnswer(sessionId: String, generation: UInt64) -> Bool {
    let expected = syncQueue.sync { answerGenerationBySession[sessionId] }
    guard let expected, expected == generation else { return false }
    return NativeVideoCallRuntime.shared.matches(sessionId: sessionId, generation: generation)
  }

  private func isStillAccepting(sessionId: String) -> Bool {
    let snap = NativeVideoCallRuntime.shared.snapshot()
    return snap.session?.sessionId == sessionId && snap.state == .accepting
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    NativeVideoCallLog.info(event, callId: sessionId, details: extra)
  }
}
