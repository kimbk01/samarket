import Foundation

/**
 * Phase 1-A — iOS Native Voice Call Runtime state machine.
 *
 * Owns at most one active voice session. Thread-safe via a dedicated serial queue.
 * Phase publish fan-out: DibayCallCoordinator + NativeVoiceCallUiHost (stub).
 */
final class NativeVoiceCallRuntime: @unchecked Sendable {
  static let shared = NativeVoiceCallRuntime()

  private let queue = DispatchQueue(label: "com.dibay.app.native-voice-call-runtime")
  private var session: NativeVoiceCallSession?
  private var phase: NativeVoiceCallPhase = .idle
  private var generation: UInt64 = 0

  init() {}

  /// Monotonic generation for stale CallKit / Agora callbacks.
  func currentGeneration() -> UInt64 {
    queue.sync { generation }
  }

  func matches(sessionId: String, generation expected: UInt64) -> Bool {
    queue.sync {
      guard let active = session else { return false }
      return active.sessionId == sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        && generation == expected
    }
  }

  func getSession(sessionId: String) -> NativeVoiceCallSession? {
    queue.sync {
      guard let active = session, active.sessionId == normalize(sessionId) else { return nil }
      return active
    }
  }

  // MARK: - Registration

  func registerIncomingSession(_ session: NativeVoiceCallSession) throws {
    try queue.sync {
      try registerLocked(session, expectedDirection: .incoming, presentedPhase: .incomingPresented)
      publishUiLocked(sessionId: session.sessionId, source: "register_incoming")
    }
  }

  func registerOutgoingSession(_ session: NativeVoiceCallSession) throws {
    try queue.sync {
      try registerLocked(session, expectedDirection: .outgoing, presentedPhase: .outgoingStarting)
      publishUiLocked(sessionId: session.sessionId, source: "register_outgoing")
    }
  }

  // MARK: - Accept

  func beginAccept(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard active.direction == .incoming else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "beginAccept")
      }
      guard phase == .incomingPresented else {
        if phase == .accepting || phase == .accepted || isPostAcceptPipeline(phase) {
          throw NativeVoiceCallRuntimeError.duplicateAction
        }
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "beginAccept")
      }
      phase = .accepting
      publishUiLocked(sessionId: active.sessionId, source: "begin_accept")
    }
  }

  func markAcceptSucceeded(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard phase == .accepting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markAcceptSucceeded")
      }
      phase = .accepted
      publishUiLocked(sessionId: active.sessionId, source: "accept_succeeded")
    }
  }

  func markAcceptFailed(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard phase == .accepting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markAcceptFailed")
      }
      phase = .failed(reason: .acceptFailed)
      publishUiLocked(sessionId: active.sessionId, source: "accept_failed")
    }
  }

  /// Fail from any non-terminal pipeline phase (token / join / media). Idempotent when already failed/ended.
  func markPipelineFailed(sessionId: String, reason: NativeVoiceCallFailure) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed, .idle:
        return
      case .incomingPresented, .outgoingStarting, .accepting, .accepted, .tokenPending, .joining,
        .connected, .rejecting, .ending:
        phase = .failed(reason: reason)
        publishUiLocked(sessionId: active.sessionId, source: "pipeline_failed")
      }
    }
  }

  // MARK: - Connect pipeline

  func markTokenPending(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard phase == .accepted else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markTokenPending")
      }
      phase = .tokenPending
      publishUiLocked(sessionId: active.sessionId, source: "token_pending")
    }
  }

  /// Outgoing caller path — `outgoingStarting` → `tokenPending` without accept phases.
  func beginOutgoingConnect(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard active.direction == .outgoing else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "beginOutgoingConnect")
      }
      guard phase == .outgoingStarting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "beginOutgoingConnect")
      }
      phase = .tokenPending
      publishUiLocked(sessionId: active.sessionId, source: "outgoing_token_pending")
    }
  }

  func markJoining(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard phase == .tokenPending else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markJoining")
      }
      phase = .joining
      publishUiLocked(sessionId: active.sessionId, source: "joining")
    }
  }

  func markConnected(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      guard phase == .joining else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markConnected")
      }
      phase = .connected
      publishUiLocked(sessionId: active.sessionId, source: "connected")
    }
  }

  // MARK: - Reject / End

  func beginReject(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .rejected):
        return
      case .rejecting, .ending:
        throw NativeVoiceCallRuntimeError.duplicateAction
      case .incomingPresented, .accepting, .accepted, .tokenPending, .joining, .connected,
        .outgoingStarting, .failed:
        phase = .rejecting
        publishUiLocked(sessionId: active.sessionId, source: "begin_reject")
      case .idle:
        throw NativeVoiceCallRuntimeError.invalidSession
      }
    }
  }

  func markRejected(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .rejected):
        return
      case .rejecting:
        phase = .failed(reason: .rejected)
        publishUiLocked(sessionId: active.sessionId, source: "rejected")
        clearSessionLocked()
      default:
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markRejected")
      }
    }
  }

  func beginEnd(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .ended):
        return
      case .ending:
        throw NativeVoiceCallRuntimeError.duplicateAction
      case .idle:
        throw NativeVoiceCallRuntimeError.invalidSession
      default:
        phase = .ending
        publishUiLocked(sessionId: active.sessionId, source: "begin_end")
      }
    }
  }

  func markEnded(sessionId: String) throws {
    try queue.sync {
      let active = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .ended):
        return
      case .ending:
        phase = .ended
        publishUiLocked(sessionId: active.sessionId, source: "ended")
        clearSessionLocked()
      default:
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markEnded")
      }
    }
  }

  // MARK: - Reset / Snapshot

  func reset(sessionId: String?) {
    queue.sync {
      let sidBeforeReset = session?.sessionId
      if let sessionId {
        let trimmed = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if let active = session, active.sessionId != trimmed {
          return
        }
      }
      let wasNonIdle = phase != .idle
      clearSessionLocked()
      phase = .idle
      generation &+= 1
      if let sidBeforeReset {
        publishUiLocked(sessionId: sidBeforeReset, source: "reset_idle")
      } else if wasNonIdle {
        publishIdleLocked(source: "reset_idle")
      }
    }
  }

  func snapshot() -> NativeVoiceCallRuntimeSnapshot {
    queue.sync {
      NativeVoiceCallRuntimeSnapshot(session: session, phase: phase)
    }
  }

  // MARK: - Private

  private func registerLocked(
    _ incoming: NativeVoiceCallSession,
    expectedDirection: NativeVoiceCallDirection,
    presentedPhase: NativeVoiceCallPhase
  ) throws {
    let sid = incoming.sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, incoming.direction == expectedDirection else {
      throw NativeVoiceCallRuntimeError.invalidSession
    }
    let normalized = NativeVoiceCallSession(
      sessionId: sid,
      callUUID: incoming.callUUID,
      direction: incoming.direction,
      roomId: incoming.roomId.trimmingCharacters(in: .whitespacesAndNewlines),
      callerId: incoming.callerId.trimmingCharacters(in: .whitespacesAndNewlines),
      callerName: incoming.callerName.trimmingCharacters(in: .whitespacesAndNewlines),
      createdAt: incoming.createdAt
    )

    if let active = session {
      if active.sessionId == sid {
        if active.callUUID != normalized.callUUID {
          throw NativeVoiceCallRuntimeError.conflictingActiveCall
        }
        return
      }
      if !isTerminal(phase) {
        throw NativeVoiceCallRuntimeError.conflictingActiveCall
      }
      clearSessionLocked()
      phase = .idle
    }

    if phase != .idle && !isTerminal(phase) {
      throw NativeVoiceCallRuntimeError.internalInvariant
    }

    session = normalized
    phase = presentedPhase
    generation &+= 1
  }

  @discardableResult
  private func requireActiveSession(_ sessionId: String) throws -> NativeVoiceCallSession {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let active = session else {
      throw NativeVoiceCallRuntimeError.invalidSession
    }
    guard active.sessionId == sid else {
      throw NativeVoiceCallRuntimeError.invalidSession
    }
    return active
  }

  private func clearSessionLocked() {
    session = nil
  }

  private func isTerminal(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .ended, .failed, .idle:
      return true
    default:
      return false
    }
  }

  private func isPostAcceptPipeline(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .tokenPending, .joining, .connected:
      return true
    default:
      return false
    }
  }

  private func normalize(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func publishUiLocked(sessionId: String, source: String) {
    let snap = NativeVoiceCallRuntimeSnapshot(session: session, phase: phase)
    DispatchQueue.main.async {
      DibayCallCoordinator.shared.onRuntimeSnapshot(snap, source: source)
      NativeVoiceCallUiHost.handleRuntimeSnapshot(snap)
    }
  }

  private func publishIdleLocked(source: String) {
    let snap = NativeVoiceCallRuntimeSnapshot(session: nil, phase: .idle)
    DispatchQueue.main.async {
      DibayCallCoordinator.shared.onRuntimeSnapshot(snap, source: source)
      NativeVoiceCallUiHost.handleRuntimeSnapshot(snap)
    }
  }
}
