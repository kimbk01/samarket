import Foundation

/**
 * Phase 1-A — iOS Native Voice Call Runtime state machine.
 *
 * Owns at most one active voice session. Thread-safe via a dedicated serial queue.
 * Not wired to CallKit / PushKit / HTTP / Agora in this phase.
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

  // MARK: - Registration

  func registerIncomingSession(_ session: NativeVoiceCallSession) throws {
    try queue.sync {
      try registerLocked(session, expectedDirection: .incoming, presentedPhase: .incomingPresented)
    }
  }

  func registerOutgoingSession(_ session: NativeVoiceCallSession) throws {
    try queue.sync {
      try registerLocked(session, expectedDirection: .outgoing, presentedPhase: .outgoingStarting)
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
    }
  }

  func markAcceptSucceeded(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .accepting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markAcceptSucceeded")
      }
      phase = .accepted
    }
  }

  func markAcceptFailed(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .accepting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markAcceptFailed")
      }
      phase = .failed(reason: .acceptFailed)
    }
  }

  /// Fail from any non-terminal pipeline phase (token / join / media). Idempotent when already failed/ended.
  func markPipelineFailed(sessionId: String, reason: NativeVoiceCallFailure) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed, .idle:
        return
      case .incomingPresented, .outgoingStarting, .accepting, .accepted, .tokenPending, .joining,
        .connected, .rejecting, .ending:
        phase = .failed(reason: reason)
      }
    }
  }

  // MARK: - Connect pipeline (stubs for later phases)

  func markTokenPending(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .accepted else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markTokenPending")
      }
      phase = .tokenPending
    }
  }

  func markJoining(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .tokenPending else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markJoining")
      }
      phase = .joining
    }
  }

  func markConnected(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .joining else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markConnected")
      }
      phase = .connected
    }
  }

  // MARK: - Reject / End

  func beginReject(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .rejected):
        return
      case .rejecting, .ending:
        throw NativeVoiceCallRuntimeError.duplicateAction
      case .incomingPresented, .accepting, .accepted, .tokenPending, .joining, .connected,
        .outgoingStarting, .failed:
        phase = .rejecting
      case .idle:
        throw NativeVoiceCallRuntimeError.invalidSession
      }
    }
  }

  func markRejected(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .rejected):
        return
      case .rejecting:
        phase = .failed(reason: .rejected)
        clearSessionLocked()
      default:
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markRejected")
      }
    }
  }

  func beginEnd(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .ended):
        return
      case .ending:
        throw NativeVoiceCallRuntimeError.duplicateAction
      case .idle:
        throw NativeVoiceCallRuntimeError.invalidSession
      default:
        phase = .ending
      }
    }
  }

  func markEnded(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .ended):
        return
      case .ending:
        phase = .ended
        clearSessionLocked()
      default:
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markEnded")
      }
    }
  }

  // MARK: - Reset / Snapshot

  func reset(sessionId: String?) {
    queue.sync {
      if let sessionId {
        let trimmed = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let active = session, active.sessionId == trimmed else { return }
      }
      clearSessionLocked()
      phase = .idle
      generation &+= 1
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
      peerId: incoming.peerId,
      createdAt: incoming.createdAt
    )

    if let active = session {
      if active.sessionId == sid {
        if active.callUUID != normalized.callUUID {
          throw NativeVoiceCallRuntimeError.conflictingActiveCall
        }
        // Idempotent re-register of the same session.
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
}
