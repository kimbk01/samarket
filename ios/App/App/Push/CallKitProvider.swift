import AVFoundation
import CallKit
import Foundation
import UIKit

final class CallKitProvider: NSObject, CXProviderDelegate {
  static let shared = CallKitProvider()

  private let provider: CXProvider
  private var callUuidBySessionId: [String: UUID] = [:]
  private var hasVideoBySessionId: [String: Bool] = [:]
  private var outgoingSessionIds: Set<String> = []
  /**
   * CONTRACT: caller cancel / reject / end / missed / answered_elsewhere arrived before or without
   * a tracked CallKit map entry. Late incoming for the same sessionId must not leave a ghost ring.
   * DO NOT invent a random CallKit UUID for orphan terminals (ae486 ghost redial).
   */
  private var terminalSuppressedSessionIds: Set<String> = []
  /** Last applied bundle ringtone filename (nil = system default). */
  private var appliedRingtoneSound: String?

  private override init() {
    let config = CXProviderConfiguration(localizedName: "DIBAY")
    config.supportsVideo = true
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    if let icon = UIImage(named: "AppIcon") {
      config.iconTemplateImageData = icon.pngData()
    }
    // ringtoneSound unset → iOS system CallKit default.
    // Custom remote Admin URLs are never set here (CallKit requires bundle resource only).
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  /**
   * Apply SSOT ios_sound_name before reporting incoming.
   * - custom bundle name present → CXProviderConfiguration.ringtoneSound
   * - nil / "default" → system CallKit ringtone
   * - silent policy: IOS_CALLKIT_SILENT_POLICY_BLOCKED — Apple does not guarantee silence
   *   while presenting CallKit UI; we only avoid setting a custom sound (no AVAudioPlayer overlay).
   */
  func applyIncomingRingtoneSsot(iosSoundName: String?, policy: String?) {
    let mode = (policy ?? "default").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if mode == "silent" {
      DibayCallLog.info(
        "ios_callkit_ringtone_policy",
        sessionId: "",
        detail: "mode=silent blocked=IOS_CALLKIT_SILENT_POLICY_BLOCKED"
      )
      // Keep system default presentation; do not dual-play AVAudioPlayer.
      setProviderRingtoneSound(nil)
      return
    }
    let name = iosSoundName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if name.isEmpty || name.lowercased() == "default" {
      setProviderRingtoneSound(nil)
      DibayCallLog.info("ios_callkit_ringtone_policy", sessionId: "", detail: "mode=default source=system")
      return
    }
    // Bundle resource must exist — CallKit will fall back if missing.
    setProviderRingtoneSound(name)
    DibayCallLog.info(
      "ios_callkit_ringtone_policy",
      sessionId: "",
      detail: "mode=custom source=bundle name=\(name)"
    )
  }

  private func setProviderRingtoneSound(_ soundName: String?) {
    if appliedRingtoneSound == soundName { return }
    let config = provider.configuration
    config.ringtoneSound = soundName
    provider.configuration = config
    appliedRingtoneSound = soundName
  }

  func reportIncomingCall(
    uuidString: String,
    callerDisplayName: String,
    remoteHandle: String,
    hasVideo: Bool,
    roomId: String? = nil,
    callerId: String? = nil,
    iosSoundName: String? = nil,
    ringtonePolicy: String? = nil,
    completion: @escaping (Error?) -> Void
  ) {
    let sessionId = uuidString.trimmingCharacters(in: .whitespacesAndNewlines)
    let displayName = callerDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
    let handleValue = remoteHandle.trimmingCharacters(in: .whitespacesAndNewlines)
    let resolvedDisplayName = displayName.isEmpty ? "수신 통화" : displayName
    let resolvedRemoteHandle = handleValue.isEmpty ? resolvedDisplayName : handleValue
    applyIncomingRingtoneSsot(iosSoundName: iosSoundName, policy: ringtonePolicy)
    reconcileStaleSessionsBeforeIncoming(newSessionId: sessionId, hasVideo: hasVideo)
    let uuid = uuidFromSession(sessionId: sessionId)
    callUuidBySessionId[sessionId] = uuid
    hasVideoBySessionId[sessionId] = hasVideo
    let terminalAlreadySeen = isTerminalSuppressed(sessionId: sessionId)

    // Phase 2 — voice only: register Native Voice Runtime before CallKit presents.
    if !hasVideo {
      let session = NativeVoiceCallSession(
        sessionId: sessionId,
        callUUID: uuid,
        direction: .incoming,
        roomId: roomId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        callerId: callerId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        callerName: resolvedDisplayName,
        createdAt: Date()
      )
      do {
        try NativeVoiceCallRuntime.shared.registerIncomingSession(session)
      } catch {
        DibayCallLog.info(
          "ios_native_voice_register_failed",
          sessionId: sessionId,
          detail: "err=\(String(describing: error))"
        )
        // Keep existing CallKit presentation policy — still report incoming UI.
      }
    } else if NativeVideoCallLane.isEnabled() {
      // B5 — Native Video Runtime registration (flag ON only).
      do {
        _ = try NativeVideoCallRuntime.shared.registerIncomingSession(
          sessionId: sessionId,
          roomId: roomId ?? "",
          callerId: callerId ?? "",
          callerName: resolvedDisplayName,
          mediaType: "video",
          callUUID: uuid
        )
      } catch {
        DibayCallLog.info(
          "ios_native_video_register_failed",
          sessionId: sessionId,
          detail: "err=\(String(describing: error))"
        )
      }
    }

    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: resolvedRemoteHandle)
    update.hasVideo = hasVideo
    update.localizedCallerName = resolvedDisplayName
    if terminalAlreadySeen {
      DibayCallLog.info(
        "ios_callkit_incoming_after_terminal_suppress",
        sessionId: sessionId,
        detail: "will_report_then_end"
      )
    }
    provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      guard let self else {
        completion(error)
        return
      }
      if terminalAlreadySeen {
        // PushKit required an incoming CallKit report for this wake; dismiss immediately — no ghost ring.
        if !hasVideo {
          NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: sessionId)
        } else if NativeVideoCallLane.isEnabled() {
          NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: sessionId)
        }
        self.endCallKitSession(
          sessionId: sessionId,
          reason: .remoteEnded,
          logDetail: "terminal_suppress_after_incoming"
        )
      }
      completion(error)
    }
  }

  func reportCallEnded(uuidString: String) {
    let sid = uuidString.trimmingCharacters(in: .whitespacesAndNewlines)
    markTerminalSuppressed(sessionId: sid, reason: "report_call_ended")
    let isVideo = hasVideoBySessionId[sid] ?? false
    // Terminal VoIP / remote cleanup — Native Voice path only when Runtime still owns session.
    if !isVideo {
      let snap = NativeVoiceCallRuntime.shared.snapshot()
      if let active = snap.session, active.sessionId == sid {
        NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: sid)
      }
    } else if NativeVideoCallLane.isEnabled() {
      let snap = NativeVideoCallRuntime.shared.snapshot()
      if let active = snap.session, active.sessionId == sid {
        NativeVideoIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: sid)
      }
    }
    endCallKitSession(sessionId: sid, reason: .remoteEnded, logDetail: "report_call_ended")
  }

  /**
   * Mark session terminal so a late incoming VoIP cannot leave CallKit ringing.
   * Safe for cancel/reject/timeout races without inventing CallKit UUIDs.
   */
  func markTerminalSuppressed(sessionId: String, reason: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    terminalSuppressedSessionIds.insert(sid)
    DibayCallLog.info(
      "ios_callkit_terminal_suppressed",
      sessionId: sid,
      detail: "reason=\(reason)"
    )
  }

  func isTerminalSuppressed(sessionId: String) -> Bool {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    return terminalSuppressedSessionIds.contains(sid)
  }

  /**
   * End CallKit when map-tracked OR sessionId is the same UUID used at reportIncomingCall.
   * Never invents a random UUID (orphan invent ban).
   */
  func endCallKitSessionIfUuidKnown(
    sessionId: String,
    reason: CXCallEndedReason = .remoteEnded,
    logDetail: String
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    markTerminalSuppressed(sessionId: sid, reason: logDetail)
    if callUuidBySessionId[sid] != nil {
      endCallKitSession(sessionId: sid, reason: reason, logDetail: logDetail)
      return
    }
    guard let uuid = UUID(uuidString: sid) else {
      DibayCallLog.info(
        "ios_voip_terminal_orphan_no_uuid",
        sessionId: sid,
        detail: "reason=\(logDetail)"
      )
      return
    }
    // Product session ids are UUIDs — same value as uuidFromSession without random fallback.
    provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
    callUuidBySessionId.removeValue(forKey: sid)
    hasVideoBySessionId.removeValue(forKey: sid)
    outgoingSessionIds.remove(sid)
    DibayCallLog.info(
      "ios_voip_terminal_safe_uuid_end",
      sessionId: sid,
      detail: "reason=\(logDetail)"
    )
  }

  /**
   * Dismiss CallKit in-call UI only — no runtime terminal fan-out.
   * Use when the app already ran native cleanup (native VC end button).
   */
  func endCallKitSession(
    sessionId: String,
    reason: CXCallEndedReason = .remoteEnded,
    logDetail: String = "end_callkit_session_only"
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let uuid = callUuidBySessionId[sid] ?? UUID(uuidString: sid) else { return }
    let isVideo = hasVideoBySessionId[sid] ?? false
    if !isVideo {
      DibayCallLog.info(
        "ios_native_voice_callkit_end",
        sessionId: sid,
        detail: "reason=\(logDetail)"
      )
    }
    provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
    callUuidBySessionId.removeValue(forKey: sid)
    hasVideoBySessionId.removeValue(forKey: sid)
    outgoingSessionIds.remove(sid)
  }

  /** P4 — outgoing/active CallKit session for connected calls */
  func reportOutgoingCallStarted(sessionId: String, hasVideo: Bool, peerName: String = "") {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let uuid = uuidFromSession(sessionId: sid)
    callUuidBySessionId[sid] = uuid
    outgoingSessionIds.insert(sid)
    let trimmedPeer = peerName.trimmingCharacters(in: .whitespacesAndNewlines)
    let displayValue = trimmedPeer.isEmpty ? sid : trimmedPeer
    let handle = CXHandle(type: .generic, value: displayValue)
    let start = CXStartCallAction(call: uuid, handle: handle)
    start.isVideo = hasVideo
    let transaction = CXTransaction(action: start)
    CXCallController().request(transaction) { error in
      if let error = error {
        DibayCallLog.infoCall(
          "ios_callkit_start_failed",
          callId: sid,
          detail: "err=\(error.localizedDescription)"
        )
      }
    }
  }

  /** NativeCallService contract — prefer live Runtime session; never leak stale CallKit-only ids. */
  func getActiveCallSessionId() -> String? {
    if let active = NativeVoiceCallRuntime.shared.snapshot().session {
      return active.sessionId
    }
    if NativeVideoCallLane.isEnabled(), let video = NativeVideoCallRuntime.shared.snapshot().session {
      return video.sessionId
    }
    return nil
  }

  /// Clear orphan CallKit entries and stuck runtime before a new incoming ring.
  private func reconcileStaleSessionsBeforeIncoming(newSessionId: String, hasVideo: Bool) {
    let sid = newSessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }

    if !hasVideo {
      let snap = NativeVoiceCallRuntime.shared.snapshot()
      if let active = snap.session, active.sessionId != sid {
        let staleRuntime: Bool
        switch snap.phase {
        case .connected, .outgoingStarting:
          staleRuntime = false
        case .incomingPresented, .rejecting, .accepting, .accepted, .tokenPending, .joining,
          .ending, .ended, .failed, .idle:
          staleRuntime = true
        }
        if staleRuntime {
          DibayCallLog.info(
            "ios_callkit_runtime_stale_cleared",
            sessionId: active.sessionId,
            detail: "reason=before_incoming phase=\(String(describing: snap.phase))"
          )
          NativeVoiceCallRuntime.shared.reset(sessionId: active.sessionId)
          endCallKitSession(
            sessionId: active.sessionId,
            reason: .failed,
            logDetail: "stale_runtime_before_incoming"
          )
        }
      }
    }

    for existing in Array(callUuidBySessionId.keys) where existing != sid {
      DibayCallLog.info(
        "ios_callkit_stale_cleared",
        sessionId: existing,
        detail: "reason=before_incoming"
      )
      endCallKitSession(sessionId: existing, reason: .failed, logDetail: "stale_before_incoming")
    }
  }

  /**
   * Direction disambiguation for VoIP terminal push handling.
   * `getActiveCallSessionId()` alone cannot tell caller vs callee — both populate
   * `callUuidBySessionId`. Callers (VoIPPushRegistry) must exclude known-outgoing
   * sessions before treating a terminal push as applying to an incoming call.
   */
  func isOutgoingSession(_ sessionId: String) -> Bool {
    outgoingSessionIds.contains(sessionId.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  /** VoIP terminal disambiguation — map entry may exist while Runtime is already idle. */
  func hasTrackedCallKitSession(sessionId: String) -> Bool {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    return callUuidBySessionId[sid] != nil
  }

  private func uuidFromSession(sessionId: String) -> UUID {
    if let existing = callUuidBySessionId[sessionId] { return existing }
    if let u = UUID(uuidString: sessionId) { return u }
    return UUID()
  }

  private func sessionId(for callUUID: UUID) -> String? {
    callUuidBySessionId.first(where: { $0.value == callUUID })?.key
  }

  /// Legacy Web handoff — unchanged since pre-B5; used when `nativeVideoRuntime` is false.
  private func deliverExistingAnswerHandoff(sessionId: String) {
    CallV4SurfaceOwnerBridge.deliver(
      callId: sessionId,
      owner: "accepted_transition",
      reason: "ios_callkit_answer"
    )
    DibayPushTokenBridge.openCallDeepLink(sessionId: sessionId)
  }

  /// Legacy Web end — byte-identical to pre-B5 video `CXEndCallAction` path.
  private func deliverLegacyVideoEnd(sessionId: String, action: CXEndCallAction) {
    CallV4SurfaceOwnerBridge.deliver(
      callId: sessionId,
      owner: "terminal",
      reason: "ios_callkit_end"
    )
    action.fulfill()
    DibayPushTokenBridge.postCallAction(sessionId: sessionId, action: "reject_or_end")
    callUuidBySessionId.removeValue(forKey: sessionId)
    hasVideoBySessionId.removeValue(forKey: sessionId)
    outgoingSessionIds.remove(sessionId)
  }

  func providerDidReset(_ provider: CXProvider) {
    callUuidBySessionId.removeAll()
    hasVideoBySessionId.removeAll()
    outgoingSessionIds.removeAll()
    // Keep terminalSuppressedSessionIds — reset must not revive a cancelled session ring.
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    DibayCallAudioSessionController.shared.notifyCallKitDidActivate()
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    DibayCallAudioSessionController.shared.noteCallKitDidDeactivate()
  }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    let sid = sessionId(for: action.callUUID)
    action.fulfill()
    if let sid {
      let trimmedPeer = action.handle.value.trimmingCharacters(in: .whitespacesAndNewlines)
      let runtimePeer = NativeVoiceCallRuntime.shared.snapshot().session
        .flatMap { $0.sessionId == sid && !$0.callerName.isEmpty ? $0.callerName : nil }
      let displayValue = (runtimePeer ?? trimmedPeer).trimmingCharacters(in: .whitespacesAndNewlines)
      let localizedName = displayValue.isEmpty ? sid : displayValue
      let update = CXCallUpdate()
      update.remoteHandle = CXHandle(type: .generic, value: localizedName)
      update.localizedCallerName = localizedName
      update.hasVideo = hasVideoBySessionId[sid] ?? action.isVideo
      provider.reportCall(with: action.callUUID, updated: update)
      provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    }
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard let sessionId = sessionId(for: action.callUUID) else {
      // Preserve prior behavior when mapping is missing: fulfill without handoff.
      action.fulfill()
      return
    }

    let isVideo = hasVideoBySessionId[sessionId] ?? false
    if isVideo {
      if NativeVideoCallLane.isEnabled() {
        NativeVideoIncomingCallCoordinator.shared.handleAnswer(sessionId: sessionId) { fulfill in
          DispatchQueue.main.async {
            if fulfill {
              action.fulfill()
            } else {
              action.fail()
            }
          }
        }
        return
      }
      deliverExistingAnswerHandoff(sessionId: sessionId)
      action.fulfill()
      return
    }

    // Phase iOS-V1 Incoming Voice — Native establishment only (no Web handoff).
    NativeVoiceIncomingCallCoordinator.shared.handleAnswer(sessionId: sessionId) { fulfill in
      DispatchQueue.main.async {
        if fulfill {
          action.fulfill()
          let snap = NativeVoiceCallRuntime.shared.snapshot()
          NativeVoiceCallUiHost.handleRuntimeSnapshot(snap)
        } else {
          action.fail()
        }
      }
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard let sessionId = callUuidBySessionId.first(where: { $0.value == action.callUUID })?.key else {
      action.fulfill()
      return
    }

    let isVideo = hasVideoBySessionId[sessionId] ?? false
    if isVideo {
      if NativeVideoCallLane.isEnabled() {
        NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sessionId) {
          DispatchQueue.main.async {
            action.fulfill()
            self.callUuidBySessionId.removeValue(forKey: sessionId)
            self.hasVideoBySessionId.removeValue(forKey: sessionId)
            self.outgoingSessionIds.remove(sessionId)
          }
        }
        return
      }
      deliverLegacyVideoEnd(sessionId: sessionId, action: action)
      return
    }

    // Voice — only route to Native V1 coordinator when Runtime actually owns this session.
    // Outgoing sessions already cleaned up natively must not fall through to legacy Web handoff.
    let runtimeOwnsSession = NativeVoiceCallRuntime.shared.snapshot().session?.sessionId == sessionId
    if !runtimeOwnsSession, isOutgoingSession(sessionId) {
      DibayCallLog.info(
        "ios_native_voice_callkit_end",
        sessionId: sessionId,
        detail: "reason=callkit_end_outgoing_runtime_cleared"
      )
      action.fulfill()
      callUuidBySessionId.removeValue(forKey: sessionId)
      hasVideoBySessionId.removeValue(forKey: sessionId)
      outgoingSessionIds.remove(sessionId)
      return
    }
    guard runtimeOwnsSession else {
      DibayCallLog.info(
        "ios_legacy_web_voice_callkit_end",
        sessionId: sessionId,
        detail: "reason=callkit_end_action_runtime_unowned"
      )
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "terminal",
        reason: "ios_callkit_end"
      )
      action.fulfill()
      DibayPushTokenBridge.postCallAction(sessionId: sessionId, action: "reject_or_end")
      callUuidBySessionId.removeValue(forKey: sessionId)
      hasVideoBySessionId.removeValue(forKey: sessionId)
      outgoingSessionIds.remove(sessionId)
      return
    }

    DibayCallLog.info(
      "ios_native_voice_callkit_end",
      sessionId: sessionId,
      detail: "reason=callkit_end_action"
    )
    NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sessionId) {
      DispatchQueue.main.async {
        action.fulfill()
        self.callUuidBySessionId.removeValue(forKey: sessionId)
        self.hasVideoBySessionId.removeValue(forKey: sessionId)
        self.outgoingSessionIds.remove(sessionId)
      }
    }
  }
}
