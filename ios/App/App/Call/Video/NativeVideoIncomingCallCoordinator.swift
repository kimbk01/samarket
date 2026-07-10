import AVFoundation
import Foundation

/**
 * Phase B4 — Incoming video establishment coordinator.
 * Owns Accept → Token → Agora join → Connected / cleanup. CallKit wiring stays in B5.
 */
final class NativeVideoIncomingCallCoordinator: NativeVideoCallAgoraEngineListener {
  static let shared = NativeVideoIncomingCallCoordinator()

  private let syncQueue = DispatchQueue(label: "com.dibay.app.native-video-incoming-coordinator")
  private var answerGenerationBySession: [String: UInt64] = [:]
  private var agoraGenerationBySession: [String: UInt64] = [:]
  private var cleanupInFlight: Set<String> = []
  private var callkitFulfilled: Set<String> = []

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
      log("ios_native_video_accept_failed", sid, "err=\(String(describing: error))")
      completion(false)
      return
    } catch {
      log("ios_native_video_accept_failed", sid, "err=\(String(describing: error))")
      completion(false)
      return
    }

    log("ios_native_video_permission_check_started", sid)
    ensureMediaPermissions(sessionId: sid) { [weak self] granted in
      guard let self else { return }
      guard self.isStillAccepting(sessionId: sid) else {
        self.log("ios_native_video_stale_callback_ignored", sid, "stage=permission")
        completion(false)
        return
      }
      if !granted {
        self.log("ios_native_video_accept_failed", sid, "err=missing_camera_or_microphone_permission")
        self.failBeforeFulfill(
          sessionId: sid,
          generation: NativeVideoCallRuntime.shared.currentGeneration(),
          reason: .missingCameraOrMicrophonePermission,
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
      log("ios_native_video_stale_callback_ignored", sid, "stage=continue_after_permission")
      completion(false)
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
        self.log("ios_native_video_accept_failed", sid, "status=\(status) err=\(error ?? "")")
        self.failBeforeFulfill(
          sessionId: sid,
          generation: runtimeGen,
          reason: .acceptFailed,
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
            serverAction: "end",
            completion: completion
          )
          return
        }
        self.syncQueue.sync { self.agoraGenerationBySession[sid] = join.generation }

        DibayCallAudioSessionController.shared.activateForCall(video: true)

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
          reportCallKitEnded: false,
          serverAction: nil
        )
        completion()
      }
    case .connecting, .connected:
      log("ios_native_video_local_end", sid, "state=\(snap.state)")
      do { try NativeVideoCallRuntime.shared.beginEnd(sessionId: sid) } catch { /* */ }
      NativeVideoCallApi.endAsync(callId: sid) { [weak self] _, _, _ in
        do { try NativeVideoCallRuntime.shared.markEnded(sessionId: sid) } catch { /* */ }
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
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard snap.session?.sessionId == sid else { return }
    do {
      try NativeVideoCallRuntime.shared.beginEnd(sessionId: sid)
      try NativeVideoCallRuntime.shared.markEnded(sessionId: sid)
    } catch {
      try? NativeVideoCallRuntime.shared.markFailed(sessionId: sid, reason: .ended)
    }
    log("ios_native_video_remote_terminal", sid, "state=\(snap.state)")
    cleanup(sessionId: sid, reason: "remote_terminal", reportCallKitEnded: false, serverAction: nil)
  }

  // MARK: - Agora Listener

  func onConnected() {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let gen = syncQueue.sync { agoraGenerationBySession[sid] }
    guard let gen, NativeVideoCallAgoraEngine.shared.matches(callId: sid, generation: gen) else {
      log("ios_native_video_stale_callback_ignored", sid, "stage=connected")
      return
    }
    do {
      try NativeVideoCallRuntime.shared.markConnected(sessionId: sid)
      log("ios_native_video_connected", sid)
      DibayActiveCallSessionManager.shared.bindActiveCall(callId: sid, mediaType: "video", phase: "CONNECTED")
      NativeVideoCallAgoraEngine.shared.attachLocalPreviewIfUiReady(callId: sid)
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
    failAfterFulfill(sessionId: sid, reason: .mediaFailed, serverAction: "end")
  }

  func onError(reason: String) {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
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
    reason: NativeVideoCallFailure,
    serverAction: String?,
    completion: @escaping (Bool) -> Void
  ) {
    guard isCurrentAnswer(sessionId: sessionId, generation: generation) else {
      log("ios_native_video_stale_callback_ignored", sessionId, "stage=fail_before")
      return
    }
    log("ios_native_video_callkit_failed", sessionId, "reason=\(String(describing: reason))")
    try? NativeVideoCallRuntime.shared.markFailed(sessionId: sessionId, reason: reason)
    cleanup(sessionId: sessionId, reason: "fail_before_fulfill", reportCallKitEnded: true, serverAction: serverAction)
    completion(false)
  }

  private func failAfterFulfill(sessionId: String, reason: NativeVideoCallFailure, serverAction: String?) {
    log("ios_native_video_cleanup_started", sessionId, "reason=\(String(describing: reason))")
    try? NativeVideoCallRuntime.shared.markFailed(sessionId: sessionId, reason: reason)
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

    log("ios_native_video_cleanup_started", sid, "reason=\(reason)")

    if let serverAction {
      if serverAction == "end" {
        NativeVideoCallApi.endAsync(callId: sid) { _, _, _ in }
      } else if serverAction == "reject" {
        NativeVideoCallApi.rejectAsync(callId: sid) { _, _, _ in }
      }
    }

    NativeVideoCallAgoraEngine.shared.leave(reason: reason, notifyListener: false)
    DibayCallAudioSessionController.shared.deactivate()
    if !sid.isEmpty {
      NativeVideoCallUiHost.clearVideoSurfaces(callId: sid)
      NativeVideoCallUiHost.finishIfActive(callId: sid)
    }
    NativeVideoCallRuntime.shared.reset(sessionId: sid)
    if DibayActiveCallSessionManager.shared.callId == sid {
      DibayActiveCallSessionManager.shared.clearSession()
    }

    if reportCallKitEnded {
      CallKitProvider.shared.reportCallEnded(uuidString: sid)
    }

    syncQueue.sync {
      answerGenerationBySession.removeValue(forKey: sid)
      agoraGenerationBySession.removeValue(forKey: sid)
      callkitFulfilled.remove(sid)
      cleanupInFlight.remove(sid)
    }
    log("ios_native_video_cleanup_done", sid, "reason=\(reason)")
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

  private func hasMediaPermissions() -> Bool {
    isAudioAuthorized() && AVCaptureDevice.authorizationStatus(for: .video) == .authorized
  }

  private func isAudioAuthorized() -> Bool {
    if #available(iOS 17.0, *) {
      return AVAudioApplication.shared.recordPermission == .granted
    }
    return AVAudioSession.sharedInstance().recordPermission == .granted
  }

  private func ensureMediaPermissions(sessionId: String, completion: @escaping (Bool) -> Void) {
    if hasMediaPermissions() {
      DispatchQueue.main.async { completion(true) }
      return
    }
    requestAudioPermission { [weak self] audioGranted in
      guard let self else {
        DispatchQueue.main.async { completion(false) }
        return
      }
      guard audioGranted else {
        self.log("ios_native_video_permission_denied", sessionId, "kind=microphone")
        DispatchQueue.main.async { completion(false) }
        return
      }
      self.requestVideoPermission { videoGranted in
        if !videoGranted {
          self.log("ios_native_video_permission_denied", sessionId, "kind=camera")
        }
        DispatchQueue.main.async { completion(videoGranted) }
      }
    }
  }

  private func requestAudioPermission(completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        completion(true)
      case .undetermined:
        AVAudioApplication.requestRecordPermission { granted in
          completion(granted)
        }
      default:
        completion(false)
      }
      return
    }
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      completion(true)
    case .undetermined:
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        completion(granted)
      }
    default:
      completion(false)
    }
  }

  private func requestVideoPermission(completion: @escaping (Bool) -> Void) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      completion(true)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        completion(granted)
      }
    default:
      completion(false)
    }
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    NativeVideoCallLog.info(event, callId: sessionId, details: extra)
  }
}
