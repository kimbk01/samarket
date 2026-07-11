import Foundation

/**
 * Phase 4 — Outgoing voice establishment coordinator (Android `handleOutgoing` parity).
 * Callee accept remains in `NativeVoiceIncomingCallCoordinator`.
 */
final class NativeVoiceOutgoingCallCoordinator: NativeVoiceCallAgoraEngineListener {
  static let shared = NativeVoiceOutgoingCallCoordinator()

  private let syncQueue = DispatchQueue(label: "com.dibay.app.native-voice-outgoing-coordinator")
  private var agoraGenerationBySession: [String: UInt64] = [:]

  private init() {}

  func handleOutgoing(
    callId: String,
    roomId: String,
    peerUserId: String,
    peerName: String,
    mediaType: String
  ) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    guard NativeVoiceCallLane.isOutgoingVoiceLaneActive(mediaType: mediaType) else {
      log("ios_native_voice_outgoing_lane_blocked", sid, "mediaType=\(mediaType)")
      return
    }
    guard NativeVoiceCallOwner.claimNative(callId: sid, reason: "outgoing_start") else { return }

    log("ios_native_voice_caller_outgoing_start", sid, "roomId=\(roomId) mediaType=\(mediaType)")

    DibayCallAudioSessionController.shared.resetOutgoingJoinGate()

    let callUUID = UUID(uuidString: sid) ?? UUID()
    let session = NativeVoiceCallSession(
      sessionId: sid,
      callUUID: callUUID,
      direction: .outgoing,
      roomId: roomId.trimmingCharacters(in: .whitespacesAndNewlines),
      callerId: peerUserId.trimmingCharacters(in: .whitespacesAndNewlines),
      callerName: peerName.trimmingCharacters(in: .whitespacesAndNewlines),
      createdAt: Date()
    )

    do {
      try NativeVoiceCallRuntime.shared.registerOutgoingSession(session)
    } catch {
      log("ios_native_voice_outgoing_register_failed", sid, "err=\(String(describing: error))")
      NativeVoiceCallOwner.release(callId: sid, reason: "register_failed")
      return
    }

    CallKitProvider.shared.reportOutgoingCallStarted(sessionId: sid, hasVideo: false)
    DibayCallAudioSessionController.shared.prepareForNativeVoiceCall()

    do {
      try NativeVoiceCallRuntime.shared.beginOutgoingConnect(sessionId: sid)
    } catch {
      log("ios_native_voice_outgoing_connect_failed", sid, "err=\(String(describing: error))")
      fail(sessionId: sid, reason: .internalInvariant)
      return
    }

    DibayCallAudioSessionController.shared.registerPendingOutgoingJoin(
      sessionId: sid,
      work: { [weak self] in
        self?.startTokenFetchAndJoin(sessionId: sid)
      },
      onTimeout: { [weak self] in
        self?.log("ios_audio_session_gate_timeout", sid)
        self?.fail(sessionId: sid, reason: .internalInvariant)
      }
    )
  }

  // MARK: - Agora Listener

  func onLocalJoined() {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    log("ios_native_voice_caller_agora_local_audio_ready", sid)
  }

  func onRemoteJoined() {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    log("ios_native_voice_agora_remote_joined", sid)
  }

  func onConnected() {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let gen = syncQueue.sync { agoraGenerationBySession[sid] }
    guard let gen, NativeVoiceCallAgoraEngine.shared.matches(callId: sid, generation: gen) else {
      log("ios_native_voice_stale_callback_ignored", sid, "stage=outgoing_connected")
      return
    }
    do {
      try NativeVoiceCallRuntime.shared.markConnected(sessionId: sid)
      log("ios_native_voice_connected", sid)
    } catch {
      log("ios_native_voice_stale_callback_ignored", sid, "stage=mark_outgoing_connected")
    }
  }

  func onDisconnected(reason: String) {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    if case .ending = snap.phase { return }
    if case .ended = snap.phase { return }
    if case .failed = snap.phase { return }
    fail(sessionId: sid, reason: .mediaFailed)
  }

  func onError(reason: String) {
    guard let sid = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() else { return }
    fail(sessionId: sid, reason: .joinFailed)
  }

  // MARK: - Private

  private func startTokenFetchAndJoin(sessionId: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }

    log("ios_native_voice_token_started", sid)
    NativeVoiceCallApi.fetchTokenAsync(callId: sid) { [weak self] connection, tokenError in
      guard let self else { return }
      guard self.isCurrentOutgoing(sessionId: sid) else {
        self.log("ios_native_voice_stale_callback_ignored", sid, "stage=outgoing_token")
        return
      }
      guard let connection else {
        self.log("ios_native_voice_token_failed", sid, "err=\(tokenError ?? "")")
        self.fail(sessionId: sid, reason: .tokenFailed)
        return
      }
      self.log("ios_native_voice_token_succeeded", sid)

      do {
        try NativeVoiceCallRuntime.shared.markJoining(sessionId: sid)
      } catch {
        self.fail(sessionId: sid, reason: .internalInvariant)
        return
      }

      self.log("ios_native_voice_agora_join_started", sid)
      let join = NativeVoiceCallAgoraEngine.shared.joinCaller(
        callId: sid,
        token: connection,
        listener: self
      )
      guard join.ok else {
        self.log("ios_native_voice_outgoing_join_failed", sid, "err=\(join.error ?? "join_failed")")
        self.fail(sessionId: sid, reason: .joinFailed)
        return
      }
      self.syncQueue.sync { self.agoraGenerationBySession[sid] = join.generation }
    }
  }

  private func fail(sessionId: String, reason: NativeVoiceCallFailure) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    log("ios_native_voice_outgoing_failed", sid, "reason=\(String(describing: reason))")
    DibayCallAudioSessionController.shared.resetOutgoingJoinGate()
    try? NativeVoiceCallRuntime.shared.markPipelineFailed(sessionId: sid, reason: reason)
    NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sid) {}
  }

  private func isCurrentOutgoing(sessionId: String) -> Bool {
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    guard let active = snap.session, active.sessionId == sessionId, active.direction == .outgoing else {
      return false
    }
    switch snap.phase {
    case .outgoingStarting, .tokenPending, .joining:
      return true
    default:
      return false
    }
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    DibayCallLog.info(event, sessionId: sessionId, detail: extra)
  }
}
