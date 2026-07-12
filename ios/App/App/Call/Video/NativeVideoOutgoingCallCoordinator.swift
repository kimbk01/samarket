import Foundation

/**
 * Phase O4 — Outgoing video establishment coordinator (Android `handleOutgoing` + Voice outgoing parity).
 */
final class NativeVideoOutgoingCallCoordinator: NativeVideoCallAgoraEngineListener {
  static let shared = NativeVideoOutgoingCallCoordinator()

  private static let connectingTimeoutSeconds: TimeInterval = 12

  private let syncQueue = DispatchQueue(label: "com.dibay.app.native-video-outgoing-coordinator")
  private var agoraGenerationBySession: [String: UInt64] = [:]
  private var outgoingGenerationBySession: [String: UInt64] = [:]
  private var connectingTimeoutWorkItem: DispatchWorkItem?

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
    guard NativeVideoCallLane.isOutgoingVideoLaneActive(mediaType: mediaType) else {
      log("ios_native_video_outgoing_lane_blocked", sid, "mediaType=\(mediaType)")
      return
    }

    log("caller_outgoing_start", sid, "roomId=\(roomId) mediaType=\(mediaType)")

    guard NativeVideoCallOwner.claimNative(callId: sid, reason: "outgoing_start") else { return }
    NativeVideoCallLog.info("legacy_web_handoff_blocked", callId: sid, details: "reason=native_video_runtime")

    let callUUID = UUID(uuidString: sid) ?? UUID()
    do {
      try NativeVideoCallRuntime.shared.registerOutgoingSession(
        sessionId: sid,
        roomId: roomId,
        peerUserId: peerUserId,
        peerName: peerName,
        callUUID: callUUID
      )
    } catch {
      log("ios_native_video_outgoing_register_failed", sid, "err=\(String(describing: error))")
      NativeVideoCallOwner.release(callId: sid, reason: "register_failed")
      return
    }

    let runtimeGen = NativeVideoCallRuntime.shared.currentGeneration()
    syncQueue.sync { outgoingGenerationBySession[sid] = runtimeGen }

    log("ios_native_video_permission_check_started", sid)
    DibayVideoMediaPermission.ensureGranted(sessionId: sid, context: .outgoing) { [weak self] granted in
      guard let self else { return }
      guard self.isCurrentOutgoing(sessionId: sid, generation: runtimeGen) else { return }
      if !granted {
        self.log("ios_native_video_outgoing_permission_denied", sid)
        self.terminateOutgoing(sessionId: sid, reason: "permission_denied")
        return
      }
      self.log("ios_native_video_permission_granted", sid)
      self.continueOutgoingAfterPermissions(
        sessionId: sid,
        generation: runtimeGen,
        peerName: peerName
      )
    }
  }

  private func continueOutgoingAfterPermissions(
    sessionId: String,
    generation: UInt64,
    peerName: String
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard isCurrentOutgoing(sessionId: sid, generation: generation) else { return }

    DibayCallAudioSessionController.shared.resetOutgoingJoinGate()
    CallKitProvider.shared.reportOutgoingCallStarted(sessionId: sid, hasVideo: true, peerName: peerName)

    DibayCallAudioSessionController.shared.registerPendingOutgoingJoin(
      sessionId: sid,
      work: { [weak self] in
        self?.startTokenFetchAndJoin(sessionId: sid, generation: generation)
      },
      onTimeout: { [weak self] in
        self?.log("ios_native_video_outgoing_audio_gate_timeout", sid)
        self?.terminateOutgoing(sessionId: sid, reason: "audio_gate_timeout")
      }
    )
  }

  // MARK: - Agora Listener

  func onConnected() {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    let gen = syncQueue.sync { agoraGenerationBySession[sid] }
    guard let gen, NativeVideoCallAgoraEngine.shared.matches(callId: sid, generation: gen) else {
      log("ios_native_video_stale_callback_ignored", sid, "stage=outgoing_connected")
      return
    }
    cancelConnectingTimeout()
    do {
      try NativeVideoCallRuntime.shared.markConnected(sessionId: sid)
      log("ios_native_video_connected", sid)
      DibayActiveCallSessionManager.shared.bindActiveCall(callId: sid, mediaType: "video", phase: "CONNECTED")
      NativeVideoCallAgoraEngine.shared.attachLocalPreviewIfUiReady(callId: sid)
      NativeVideoCallBridge.publishConnectedState(sessionId: sid, source: "outgoing_agora_connected")
    } catch {
      log("ios_native_video_stale_callback_ignored", sid, "stage=outgoing_mark_connected")
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
    terminateOutgoing(sessionId: sid, reason: "agora_disconnected:\(reason)")
  }

  func onError(reason: String) {
    guard let sid = NativeVideoCallAgoraEngine.shared.peekOccupantCallId() else { return }
    terminateOutgoing(sessionId: sid, reason: "agora_error:\(reason)")
  }

  // MARK: - Private

  private func startTokenFetchAndJoin(sessionId: String, generation: UInt64) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    guard isCurrentOutgoing(sessionId: sid, generation: generation) else { return }

    log("ios_native_video_token_started", sid)
    NativeVideoCallApi.fetchTokenAsync(callId: sid) { [weak self] connection, tokenError in
      guard let self else { return }
      guard self.isCurrentOutgoing(sessionId: sid, generation: generation) else {
        self.log("ios_native_video_stale_callback_ignored", sid, "stage=outgoing_token")
        return
      }
      guard let connection else {
        self.log("ios_native_video_token_failed", sid, "err=\(tokenError ?? "")")
        self.terminateOutgoing(sessionId: sid, reason: "token_failed")
        return
      }
      self.log("ios_native_video_token_ok", sid)
      self.log("ios_native_video_agora_join_started", sid)

      DibayCallAudioSessionController.shared.prepareForNativeVideoCall()
      let join = NativeVideoCallAgoraEngine.shared.joinCaller(
        callId: sid,
        token: connection,
        listener: self
      )
      guard join.ok else {
        self.log("ios_native_video_outgoing_join_failed", sid, "err=\(join.error ?? "join_failed")")
        self.terminateOutgoing(sessionId: sid, reason: "join_failed")
        return
      }
      self.syncQueue.sync { self.agoraGenerationBySession[sid] = join.generation }
      self.scheduleConnectingTimeout(sessionId: sid, generation: generation)
    }
  }

  private func terminateOutgoing(sessionId: String, reason: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    cancelConnectingTimeout()
    DibayCallAudioSessionController.shared.resetOutgoingJoinGate()
    log("ios_native_video_outgoing_terminal", sid, "reason=\(reason)")
    syncQueue.sync {
      outgoingGenerationBySession.removeValue(forKey: sid)
      agoraGenerationBySession.removeValue(forKey: sid)
    }
    NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sid) {}
  }

  private func scheduleConnectingTimeout(sessionId: String, generation: UInt64) {
    cancelConnectingTimeout()
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      guard self.isCurrentOutgoing(sessionId: sid, generation: generation) else { return }
      let snap = NativeVideoCallRuntime.shared.snapshot()
      guard snap.session?.sessionId == sid, snap.state == .connecting else { return }
      self.log("ios_native_video_outgoing_join_hang", sid, "timeout_s=\(Int(Self.connectingTimeoutSeconds))")
      self.terminateOutgoing(sessionId: sid, reason: "join_hang")
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

  private func isCurrentOutgoing(sessionId: String, generation: UInt64) -> Bool {
    let expected = syncQueue.sync { outgoingGenerationBySession[sessionId] }
    guard let expected, expected == generation else { return false }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard let active = snap.session, active.sessionId == sessionId, active.initiator else { return false }
    return snap.state == .connecting
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    NativeVideoCallLog.info(event, callId: sessionId, details: extra)
  }
}
