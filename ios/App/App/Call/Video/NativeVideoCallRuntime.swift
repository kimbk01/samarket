import Foundation

/**
 * Phase B2 — iOS Native Video Call Runtime state machine.
 *
 * Owns at most one active video session. Thread-safe via a dedicated serial queue.
 * Mirrors Android `NativeVideoCallRuntime` states without CallKit / HTTP / Agora wiring.
 */
final class NativeVideoCallRuntime: @unchecked Sendable {
  static let shared = NativeVideoCallRuntime()

  private static let missedTimeoutSeconds: TimeInterval = 30

  private let queue = DispatchQueue(label: "com.dibay.app.native-video-call-runtime")
  private var session: NativeVideoCallSession?
  private var state: NativeVideoCallRuntimeState = .ended
  private var generation: UInt64 = 0
  private var missedWorkItem: DispatchWorkItem?

  init() {}

  func currentGeneration() -> UInt64 {
    queue.sync { generation }
  }

  func matches(sessionId: String, generation expected: UInt64) -> Bool {
    queue.sync {
      guard let active = session else { return false }
      return active.sessionId == normalize(sessionId) && generation == expected
    }
  }

  func snapshot() -> NativeVideoCallRuntimeSnapshot {
    queue.sync {
      NativeVideoCallRuntimeSnapshot(session: session, state: state)
    }
  }

  func getSession(sessionId: String) -> NativeVideoCallSession? {
    queue.sync {
      guard let active = session, active.sessionId == normalize(sessionId) else { return nil }
      return active
    }
  }

  /// Android `handleIncoming` registration — claim owner + RINGING.
  @discardableResult
  func registerIncomingSession(
    sessionId: String,
    roomId: String,
    callerId: String,
    callerName: String,
    mediaType: String,
    callUUID: UUID
  ) throws -> Bool {
    try queue.sync {
      let sid = normalize(sessionId)
      guard !sid.isEmpty else { throw NativeVideoCallRuntimeError.invalidSession }
      guard NativeVideoCallLane.isVideoMediaType(mediaType) else {
        throw NativeVideoCallRuntimeError.invalidSession
      }

      NativeVideoCallLog.info(
        "incoming_fcm_received",
        callId: sid,
        details: "roomId=\(roomId) mediaType=\(mediaType)"
      )

      guard NativeVideoCallOwner.claimNative(callId: sid, reason: "incoming_fcm") else {
        return false
      }
      NativeVideoCallLog.info("legacy_web_handoff_blocked", callId: sid, details: "reason=native_video_runtime")

      let incoming = NativeVideoCallSession(
        sessionId: sid,
        roomId: roomId.trimmingCharacters(in: .whitespacesAndNewlines),
        callerId: callerId.trimmingCharacters(in: .whitespacesAndNewlines),
        callerName: callerName.trimmingCharacters(in: .whitespacesAndNewlines),
        mediaType: "video",
        initiator: false,
        callUUID: callUUID,
        createdAt: Date()
      )

      try registerLocked(incoming, initialState: .ringing)
      scheduleMissedLocked(sessionId: sid)
      return true
    }
  }

  // MARK: - Accept pipeline

  func beginAccept(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard state == .ringing else {
        if state == .accepting || isPostAcceptPipeline(state) {
          throw NativeVideoCallRuntimeError.duplicateAction
        }
        throw NativeVideoCallRuntimeError.invalidTransition(from: state, action: "beginAccept")
      }
      cancelMissedLocked()
      state = .accepting
      NativeVideoCallLog.info("accept_tapped", callId: normalize(sessionId))
    }
  }

  func markConnecting(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard state == .accepting else {
        throw NativeVideoCallRuntimeError.invalidTransition(from: state, action: "markConnecting")
      }
      state = .connecting
    }
  }

  func markConnected(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard state == .connecting else {
        throw NativeVideoCallRuntimeError.invalidTransition(from: state, action: "markConnected")
      }
      cancelMissedLocked()
      state = .connected
      NativeVideoCallLog.info("state_connected", callId: normalize(sessionId))
    }
  }

  func markFailed(sessionId: String, reason: NativeVideoCallFailure) throws {
    try queue.sync {
      let sid = normalize(sessionId)
      _ = try requireActiveSession(sid)
      guard !isTerminal(state) else { return }
      cancelMissedLocked()
      state = .failed
      NativeVideoCallLog.warn("error_terminal", callId: sid, details: "reason=\(reason)")
      clearSessionLocked(sessionId: sid, releaseOwnerReason: "failed")
    }
  }

  // MARK: - Reject / End / Missed

  func beginReject(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch state {
      case .ended, .failed:
        return
      case .ending:
        throw NativeVideoCallRuntimeError.duplicateAction
      default:
        cancelMissedLocked()
        state = .ending
      }
    }
  }

  func markRejected(sessionId: String) throws {
    try queue.sync {
      let sid = normalize(sessionId)
      _ = try requireActiveSession(sid)
      switch state {
      case .ended, .failed:
        return
      case .ending, .ringing, .accepting, .connecting, .connected:
        cancelMissedLocked()
        state = .failed
        clearSessionLocked(sessionId: sid, releaseOwnerReason: "reject")
      }
    }
  }

  func beginEnd(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch state {
      case .ended, .failed:
        return
      case .ending:
        throw NativeVideoCallRuntimeError.duplicateAction
      default:
        cancelMissedLocked()
        state = .ending
        NativeVideoCallLog.info("end_tapped", callId: normalize(sessionId))
      }
    }
  }

  func markEnded(sessionId: String) throws {
    try queue.sync {
      let sid = normalize(sessionId)
      _ = try requireActiveSession(sid)
      switch state {
      case .ended:
        return
      case .ending, .connected, .connecting, .accepting, .ringing, .failed:
        cancelMissedLocked()
        state = .ended
        clearSessionLocked(sessionId: sid, releaseOwnerReason: "ended")
      }
    }
  }

  func markMissed(sessionId: String) throws {
    try queue.sync {
      let sid = normalize(sessionId)
      guard let active = session, active.sessionId == sid else { return }
      guard state == .ringing else { return }
      cancelMissedLocked()
      state = .failed
      NativeVideoCallLog.info("missed_timeout", callId: sid)
      clearSessionLocked(sessionId: sid, releaseOwnerReason: "missed")
    }
  }

  func reset(sessionId: String?) {
    queue.sync {
      if let sessionId {
        let sid = normalize(sessionId)
        guard let active = session, active.sessionId == sid else { return }
        clearSessionLocked(sessionId: sid, releaseOwnerReason: "reset")
      } else {
        if let active = session {
          clearSessionLocked(sessionId: active.sessionId, releaseOwnerReason: "reset")
        }
      }
      state = .ended
      generation &+= 1
    }
  }

  // MARK: - Guards

  func findOtherLiveSessionCallId(incomingCallId: String) -> String? {
    queue.sync {
      let incoming = normalize(incomingCallId)
      guard let active = session, active.sessionId != incoming else { return nil }
      switch state {
      case .accepting, .connecting, .connected:
        return active.sessionId
      default:
        return nil
      }
    }
  }

  // MARK: - Private

  private func registerLocked(_ incoming: NativeVideoCallSession, initialState: NativeVideoCallRuntimeState) throws {
    let sid = incoming.sessionId
    guard !sid.isEmpty, !incoming.initiator else {
      throw NativeVideoCallRuntimeError.invalidSession
    }

    if let active = session {
      if active.sessionId == sid {
        if active.callUUID != incoming.callUUID {
          throw NativeVideoCallRuntimeError.conflictingActiveCall
        }
        return
      }
      if !isTerminal(state) {
        throw NativeVideoCallRuntimeError.conflictingActiveCall
      }
      clearSessionLocked(sessionId: active.sessionId, releaseOwnerReason: "superseded")
      state = .ended
    }

    if !isTerminal(state) && session != nil {
      throw NativeVideoCallRuntimeError.internalInvariant
    }

    session = incoming
    state = initialState
    generation &+= 1
  }

  @discardableResult
  private func requireActiveSession(_ sessionId: String) throws -> NativeVideoCallSession {
    let sid = normalize(sessionId)
    guard let active = session else {
      throw NativeVideoCallRuntimeError.invalidSession
    }
    guard active.sessionId == sid else {
      throw NativeVideoCallRuntimeError.invalidSession
    }
    return active
  }

  private func clearSessionLocked(sessionId: String, releaseOwnerReason: String) {
    NativeVideoCallOwner.release(callId: sessionId, reason: releaseOwnerReason)
    session = nil
    generation &+= 1
  }

  private func scheduleMissedLocked(sessionId: String) {
    cancelMissedLocked()
    let sid = normalize(sessionId)
    let expectedGeneration = generation
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      guard self.matches(sessionId: sid, generation: expectedGeneration) else { return }
      try? self.markMissed(sessionId: sid)
    }
    missedWorkItem = work
    queue.asyncAfter(deadline: .now() + Self.missedTimeoutSeconds, execute: work)
  }

  private func cancelMissedLocked() {
    missedWorkItem?.cancel()
    missedWorkItem = nil
  }

  private func isTerminal(_ state: NativeVideoCallRuntimeState) -> Bool {
    switch state {
    case .ended, .failed:
      return true
    default:
      return false
    }
  }

  private func isPostAcceptPipeline(_ state: NativeVideoCallRuntimeState) -> Bool {
    switch state {
    case .connecting, .connected:
      return true
    default:
      return false
    }
  }

  private func normalize(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
