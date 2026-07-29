import CallKit
import Foundation

/**
 * Phase iOS-V1 — Incoming voice establishment coordinator.
 * Owns Accept → Token → Agora join → Connected / cleanup. CallKitProvider stays thin.
 */
final class NativeVoiceIncomingCallCoordinator: NativeVoiceCallAgoraEngineListener {
  static let shared = NativeVoiceIncomingCallCoordinator()

  private let syncQueue = DispatchQueue(label: "com.dibay.app.native-voice-incoming-coordinator")
  private var answerGenerationBySession: [String: UInt64] = [:]
  private var agoraGenerationBySession: [String: UInt64] = [:]
  private var cleanupInFlight: Set<String> = []
  private var callkitFulfilled: Set<String> = []

  private init() {}

  // MARK: - Answer

  /// Runs Native accept → token → Agora join request. Completes with fulfill/fail decision.
  func handleAnswer(
    sessionId: String,
    completion: @escaping (_ fulfill: Bool) -> Void
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(false)
      return
    }

    log("ios_native_voice_answer_started", sid)

    let micContext = DibayVoiceMicrophonePermission.resolveIncomingAnswerContext()
    DibayVoiceMicrophonePermission.ensureGranted(sessionId: sid, context: micContext) { [weak self] micGranted in
      guard let self else {
        completion(false)
        return
      }
      guard micGranted else {
        self.failMicrophoneBeforeAccept(sessionId: sid, context: micContext, completion: completion)
        return
      }
      self.continueHandleAnswer(sessionId: sid, completion: completion)
    }
  }

  private func continueHandleAnswer(
    sessionId: String,
    completion: @escaping (_ fulfill: Bool) -> Void
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)

    do {
      try NativeVoiceCallRuntime.shared.beginAccept(sessionId: sid)
    } catch let error as NativeVoiceCallRuntimeError {
      if case .duplicateAction = error {
        log("ios_native_voice_begin_accept_duplicate", sid)
        completion(true)
        return
      }
      log("ios_native_voice_accept_failed", sid, "err=\(String(describing: error))")
      completion(false)
      return
    } catch {
      log("ios_native_voice_accept_failed", sid, "err=\(String(describing: error))")
      completion(false)
      return
    }

    let runtimeGen = NativeVoiceCallRuntime.shared.currentGeneration()
    syncQueue.sync { answerGenerationBySession[sid] = runtimeGen }

    log("ios_native_voice_accept_started", sid)
    NativeVoiceCallApi.acceptAsync(callId: sid) { [weak self] ok, status, error in
      guard let self else { return }
      guard self.isCurrentAnswer(sessionId: sid, generation: runtimeGen) else {
        self.log("ios_native_voice_stale_callback_ignored", sid, "stage=accept")
        return
      }
      if !ok {
        let err = error ?? ""
        if err.contains("answered_elsewhere") {
          self.log("ios_native_voice_answered_elsewhere", sid, "status=\(status)")
          CallKitProvider.shared.reportCallEnded(uuidString: sid)
          completion(false)
          return
        }
        self.log("ios_native_voice_accept_failed", sid, "status=\(status) err=\(err)")
        self.failBeforeFulfill(
          sessionId: sid,
          generation: runtimeGen,
          reason: .acceptFailed,
          serverAction: nil,
          completion: completion
        )
        return
      }
      self.log("ios_native_voice_accept_succeeded", sid)
      do {
        try NativeVoiceCallRuntime.shared.markAcceptSucceeded(sessionId: sid)
        try NativeVoiceCallRuntime.shared.markTokenPending(sessionId: sid)
      } catch {
        self.failBeforeFulfill(
          sessionId: sid,
          generation: runtimeGen,
          reason: .internalInvariant,
          serverAction: "end",
          completion: completion
        )
        return
      }

      self.log("ios_native_voice_token_started", sid)
      NativeVoiceCallApi.fetchTokenAsync(callId: sid) { [weak self] connection, tokenError in
        guard let self else { return }
        guard self.isCurrentAnswer(sessionId: sid, generation: runtimeGen) else {
          self.log("ios_native_voice_stale_callback_ignored", sid, "stage=token")
          return
        }
        guard let connection else {
          self.log("ios_native_voice_token_failed", sid, "err=\(tokenError ?? "")")
          self.failBeforeFulfill(
            sessionId: sid,
            generation: runtimeGen,
            reason: .tokenFailed,
            serverAction: "end",
            completion: completion
          )
          return
        }
        self.log("ios_native_voice_token_succeeded", sid)
        self.log("ios_native_voice_token_ok", sid)

        do {
          try NativeVoiceCallRuntime.shared.markJoining(sessionId: sid)
        } catch {
          self.failBeforeFulfill(
            sessionId: sid,
            generation: runtimeGen,
            reason: .internalInvariant,
            serverAction: "end",
            completion: completion
          )
          return
        }

        self.log("ios_native_voice_agora_join_started", sid)
        let join = NativeVoiceCallAgoraEngine.shared.join(
          callId: sid,
          token: connection,
          listener: self
        )
        guard join.ok else {
          self.log("ios_native_voice_accept_failed", sid, "err=\(join.error ?? "join_failed")")
          self.failBeforeFulfill(
            sessionId: sid,
            generation: runtimeGen,
            reason: .joinFailed,
            serverAction: "end",
            completion: completion
          )
          return
        }
        self.syncQueue.sync { self.agoraGenerationBySession[sid] = join.generation }

        // Audio prepare — CallKit will also activate via didActivate.
        DibayCallAudioSessionController.shared.prepareForNativeVoiceCall()

        self.syncQueue.sync { self.callkitFulfilled.insert(sid) }
        self.log("ios_native_voice_callkit_fulfilled", sid)
        completion(true)
      }
    }
  }

  private func failMicrophoneBeforeAccept(
    sessionId: String,
    context: DibayVoiceMicrophoneGateContext,
    completion: @escaping (_ fulfill: Bool) -> Void
  ) {
    log(
      "ios_native_voice_mic_blocked_before_accept",
      sessionId,
      "context=\(context) agora_join=0"
    )
    try? NativeVoiceCallRuntime.shared.markPipelineFailed(sessionId: sessionId, reason: .mediaFailed)
    cleanup(
      sessionId: sessionId,
      reason: "mic_permission_denied",
      reportCallKitEnded: true,
      serverAction: "reject"
    )
    completion(false)
  }

  // MARK: - Reject / End / Terminal

  func handleRejectOrEnd(sessionId: String, completion: @escaping () -> Void) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion()
      return
    }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    guard let active = snap.session, active.sessionId == sid else {
      completion()
      return
    }

    switch snap.phase {
    case .incomingPresented, .accepting:
      do { try NativeVoiceCallRuntime.shared.beginReject(sessionId: sid) } catch { /* best-effort */ }
      NativeVoiceCallApi.rejectAsync(callId: sid) { [weak self] _, _, _ in
        do { try NativeVoiceCallRuntime.shared.markRejected(sessionId: sid) } catch { /* */ }
        self?.cleanup(
          sessionId: sid,
          reason: "reject",
          reportCallKitEnded: false,
          serverAction: nil
        )
        completion()
      }
    case .accepted, .tokenPending, .joining, .connected, .outgoingStarting:
      log("ios_native_voice_local_end", sid, "state=\(snap.phase)")
      do { try NativeVoiceCallRuntime.shared.beginEnd(sessionId: sid) } catch { /* */ }
      NativeVoiceCallBridge.publishLocalTerminal(sessionId: sid, reason: "ended", source: "local_end_begin")
      NativeVoiceCallApi.endAsync(callId: sid) { [weak self] _, _, _ in
        do { try NativeVoiceCallRuntime.shared.markEnded(sessionId: sid) } catch { /* */ }
        self?.cleanup(
          sessionId: sid,
          reason: "local_end",
          reportCallKitEnded: false,
          serverAction: nil
        )
        completion()
      }
    default:
      cleanup(sessionId: sid, reason: "end_idle", reportCallKitEnded: false, serverAction: nil)
      completion()
    }
  }

  func handleRemoteTerminal(sessionId: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    guard let active = snap.session, active.sessionId == sid else { return }
    do {
      try NativeVoiceCallRuntime.shared.beginEnd(sessionId: sid)
      try NativeVoiceCallRuntime.shared.markEnded(sessionId: sid)
    } catch {
      try? NativeVoiceCallRuntime.shared.markPipelineFailed(sessionId: sid, reason: .ended)
    }
    log("ios_native_voice_remote_terminal", sid, "state=\(snap.phase)")
    cleanup(sessionId: sid, reason: "remote_terminal", reportCallKitEnded: false, serverAction: nil)
  }

  // MARK: - Agora Listener

  func onLocalJoined() {
    // Logged from engine path via coordinator when connected.
  }

  func onRemoteJoined() {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    log("ios_native_voice_agora_remote_joined", sid)
  }

  func onConnected() {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let gen = syncQueue.sync { agoraGenerationBySession[sid] }
    guard let gen, NativeVoiceCallAgoraEngine.shared.matches(callId: sid, generation: gen) else {
      log("ios_native_voice_stale_callback_ignored", sid, "stage=connected")
      return
    }
    log("ios_native_voice_agora_local_joined", sid)
    NativeVoiceCallBridge.publishConnectedState(sessionId: sid, source: "incoming_agora_connected")
  }

  func onDisconnected(reason: String) {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    if case .ending = snap.phase { return }
    if case .ended = snap.phase { return }
    if case .failed = snap.phase { return }
    failAfterFulfill(sessionId: sid, reason: .mediaFailed, serverAction: "end")
  }

  func onError(reason: String) {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let fulfilled = syncQueue.sync { callkitFulfilled.contains(sid) }
    if fulfilled {
      failAfterFulfill(sessionId: sid, reason: .joinFailed, serverAction: "end")
    } else {
      let runtimeGen = syncQueue.sync { answerGenerationBySession[sid] } ?? 0
      failBeforeFulfill(
        sessionId: sid,
        generation: runtimeGen,
        reason: .joinFailed,
        serverAction: "end",
        completion: { _ in }
      )
    }
  }

  // MARK: - Fail / Cleanup

  private func failBeforeFulfill(
    sessionId: String,
    generation: UInt64,
    reason: NativeVoiceCallFailure,
    serverAction: String?,
    completion: @escaping (Bool) -> Void
  ) {
    guard isCurrentAnswer(sessionId: sessionId, generation: generation) else {
      log("ios_native_voice_stale_callback_ignored", sessionId, "stage=fail_before")
      return
    }
    log("ios_native_voice_callkit_failed", sessionId, "reason=\(String(describing: reason))")
    try? NativeVoiceCallRuntime.shared.markPipelineFailed(sessionId: sessionId, reason: reason)
    cleanup(sessionId: sessionId, reason: "fail_before_fulfill", reportCallKitEnded: true, serverAction: serverAction)
    completion(false)
  }

  private func failAfterFulfill(sessionId: String, reason: NativeVoiceCallFailure, serverAction: String?) {
    log("ios_native_voice_cleanup_started", sessionId, "reason=\(String(describing: reason))")
    try? NativeVoiceCallRuntime.shared.markPipelineFailed(sessionId: sessionId, reason: reason)
    cleanup(sessionId: sessionId, reason: "fail_after_fulfill", reportCallKitEnded: true, serverAction: serverAction)
  }

  private func cleanup(
    sessionId: String,
    reason: String,
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

    log("ios_native_voice_cleanup_started", sid, "reason=\(reason)")

    if let serverAction {
      if serverAction == "end" {
        NativeVoiceCallApi.endAsync(callId: sid) { _, _, _ in }
      } else if serverAction == "reject" {
        NativeVoiceCallApi.rejectAsync(callId: sid) { _, _, _ in }
      }
    }

    NativeVoiceCallAgoraEngine.shared.leave(reason: reason, notifyListener: false)
    DibayCallAudioSessionController.shared.deactivateAfterNativeVoiceCall()
    NativeVoiceCallBridge.clearConnectedPublish(callId: sid)
    NativeCallServicePlugin.clearNativeTerminalEmit(callId: sid)
    NativeVoiceCallRuntime.shared.reset(sessionId: sid)
    if DibayActiveCallSessionManager.shared.callId == sid {
      DibayActiveCallSessionManager.shared.clearSession()
    }

    if reportCallKitEnded {
      CallKitProvider.shared.endCallKitSession(
        sessionId: sid,
        reason: .remoteEnded,
        logDetail: reason
      )
    }
    NativeVoiceCallOwner.release(callId: sid, reason: reason)

    syncQueue.sync {
      answerGenerationBySession.removeValue(forKey: sid)
      agoraGenerationBySession.removeValue(forKey: sid)
      callkitFulfilled.remove(sid)
      cleanupInFlight.remove(sid)
    }
    log("ios_native_voice_cleanup_done", sid, "reason=\(reason)")
  }

  private func isCurrentAnswer(sessionId: String, generation: UInt64) -> Bool {
    let expected = syncQueue.sync { answerGenerationBySession[sessionId] }
    guard let expected, expected == generation else { return false }
    return NativeVoiceCallRuntime.shared.matches(sessionId: sessionId, generation: generation)
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    DibayCallLog.info(event, sessionId: sessionId, detail: extra)
  }
}
