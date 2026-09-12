import CallKit
import Foundation

/**
 * Phase 1-A — iOS Native Voice Call Runtime state machine.
 *
 * Owns at most one active voice session. Thread-safe via a dedicated serial queue.
 * Phase publish fan-out: NativeVoiceCallUiHost (incoming + outgoing voice UI).
 *
 * Missed timer dismisses locally (NORMAL) — no propose/retry hold.
 */
final class NativeVoiceCallRuntime: @unchecked Sendable {
  static let shared = NativeVoiceCallRuntime()

  private static let missedTimeoutSeconds: TimeInterval = 30

  private let queue = DispatchQueue(label: "com.dibay.app.native-voice-call-runtime")
  private var session: NativeVoiceCallSession?
  private var phase: NativeVoiceCallPhase = .idle
  private var generation: UInt64 = 0
  private var missedWorkItem: DispatchWorkItem?

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
      let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let active = session, active.sessionId == sid else { return nil }
      return active
    }
  }

  // MARK: - Registration

  func registerIncomingSession(_ session: NativeVoiceCallSession) throws {
    try queue.sync {
      try registerLocked(session, expectedDirection: .incoming, presentedPhase: .incomingPresented)
      let sid = session.sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
      scheduleMissedLocked(sessionId: sid)
      publishUiLocked(source: "register_incoming")
    }
  }

  func registerOutgoingSession(_ session: NativeVoiceCallSession) throws {
    try queue.sync {
      try registerLocked(session, expectedDirection: .outgoing, presentedPhase: .outgoingStarting)
      publishUiLocked(source: "register_outgoing")
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
      cancelMissedLocked()
      phase = .accepting
      publishUiLocked(source: "begin_accept")
    }
  }

  func markAcceptSucceeded(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .accepting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markAcceptSucceeded")
      }
      cancelMissedLocked()
      phase = .accepted
      publishUiLocked(source: "accept_succeeded")
    }
  }

  func markAcceptFailed(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .accepting else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markAcceptFailed")
      }
      cancelMissedLocked()
      phase = .failed(reason: .acceptFailed)
      publishUiLocked(source: "accept_failed")
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
        cancelMissedLocked()
        phase = .failed(reason: reason)
        publishUiLocked(source: "pipeline_failed")
      }
    }
  }

  // MARK: - Connect pipeline

  func markTokenPending(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .accepted else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markTokenPending")
      }
      cancelMissedLocked()
      phase = .tokenPending
      publishUiLocked(source: "token_pending")
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
      publishUiLocked(source: "outgoing_token_pending")
    }
  }

  func markJoining(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .tokenPending else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markJoining")
      }
      phase = .joining
      publishUiLocked(source: "joining")
    }
  }

  func markConnected(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      guard phase == .joining else {
        throw NativeVoiceCallRuntimeError.invalidTransition(from: phase, action: "markConnected")
      }
      cancelMissedLocked()
      phase = .connected
      publishUiLocked(source: "connected")
    }
    NativePresenceLeaseRenewOwner.start(
      callId: sessionId,
      renewTransport: { callId, completion in
        NativeVoiceCallApi.presenceRenewAsync(callId: callId, completion: completion)
      },
      gate: { callId in
        let snap = NativeVoiceCallRuntime.shared.snapshot()
        return snap.session?.sessionId == callId && snap.phase == .connected
      }
    )
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
        cancelMissedLocked()
        phase = .rejecting
        publishUiLocked(source: "begin_reject")
      case .idle:
        throw NativeVoiceCallRuntimeError.invalidSession
      }
    }
    NativePresenceLeaseRenewOwner.stop(callId: sessionId, reason: "begin_reject")
  }

  func markRejected(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .rejected):
        return
      case .rejecting:
        cancelMissedLocked()
        phase = .failed(reason: .rejected)
        clearSessionLocked()
        publishIdleLocked(source: "rejected")
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
        cancelMissedLocked()
        phase = .ending
        publishUiLocked(source: "begin_end")
      }
    }
    NativePresenceLeaseRenewOwner.stop(callId: sessionId, reason: "begin_end")
  }

  func markEnded(sessionId: String) throws {
    try queue.sync {
      _ = try requireActiveSession(sessionId)
      switch phase {
      case .ended, .failed(reason: .ended):
        return
      case .ending:
        cancelMissedLocked()
        phase = .ended
        clearSessionLocked()
        publishIdleLocked(source: "ended")
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
        NativePresenceLeaseRenewOwner.stop(callId: trimmed, reason: "runtime_reset")
      } else if let active = session {
        NativePresenceLeaseRenewOwner.stop(callId: active.sessionId, reason: "runtime_reset")
      }
      cancelMissedLocked()
      clearSessionLocked()
      phase = .idle
      generation &+= 1
      publishIdleLocked(source: "reset")
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
      roomId: incoming.roomId,
      callerId: incoming.callerId,
      callerName: incoming.callerName,
      createdAt: incoming.createdAt
    )

    if let active = session {
      if active.sessionId == sid {
        if active.callUUID != normalized.callUUID {
          throw NativeVoiceCallRuntimeError.conflictingActiveCall
        }
        // Idempotent re-register of the same session — refresh missed timer below.
        return
      }
      if !canReplaceActiveSessionForNewCall(phase) {
        throw NativeVoiceCallRuntimeError.conflictingActiveCall
      }
      cancelMissedLocked()
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

  /// Local end is async — `.ending` still holds the previous session until `markEnded`.
  /// Allow immediate re-dial with a new callId while the prior HTTP cleanup finishes.
  private func canReplaceActiveSessionForNewCall(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .ended, .failed, .idle, .ending:
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

  private func publishUiLocked(source: String) {
    let snap = NativeVoiceCallRuntimeSnapshot(session: session, phase: phase)
    DispatchQueue.main.async {
      NativeVoiceCallUiHost.handleRuntimeSnapshot(snap, source: source)
    }
  }

  private func publishIdleLocked(source: String) {
    let snap = NativeVoiceCallRuntimeSnapshot(session: nil, phase: .idle)
    DispatchQueue.main.async {
      NativeVoiceCallUiHost.handleRuntimeSnapshot(snap, source: source)
    }
  }

  // MARK: - Missed dismiss (NORMAL)

  private func scheduleMissedLocked(sessionId: String) {
    cancelMissedLocked()
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    guard phase == .incomingPresented, let active = session, active.sessionId == sid else { return }
    let expectedGeneration = generation
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.performMissedTimeoutIfCurrent(sessionId: sid, generation: expectedGeneration)
    }
    missedWorkItem = work
    queue.asyncAfter(deadline: .now() + Self.missedTimeoutSeconds, execute: work)
    DibayCallLog.info(
      "ios_native_voice_missed_timer_scheduled",
      sessionId: sid,
      detail: "timeoutSec=\(Int(Self.missedTimeoutSeconds)) generation=\(expectedGeneration)"
    )
  }

  private func cancelMissedLocked() {
    missedWorkItem?.cancel()
    missedWorkItem = nil
  }

  /// Called only from `queue` (missed timer) — no `queue.sync` re-entry.
  private func performMissedTimeoutIfCurrent(sessionId: String, generation expectedGeneration: UInt64) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let active = session, active.sessionId == sid, generation == expectedGeneration else {
      DibayCallLog.info(
        "ios_native_voice_missed_timer_stale",
        sessionId: sid,
        detail: "reason=call_id_or_generation_mismatch"
      )
      return
    }
    guard phase == .incomingPresented else {
      DibayCallLog.info(
        "ios_native_voice_missed_timer_stale",
        sessionId: sid,
        detail: "reason=phase_not_ringing"
      )
      return
    }
    missedWorkItem = nil
    cancelMissedLocked()
    phase = .failed(reason: .ended)
    clearSessionLocked()
    generation &+= 1
    publishIdleLocked(source: "missed_timeout")
    DibayCallLog.info(
      "ios_native_voice_missed_local_dismiss",
      sessionId: sid,
      detail: "source=local_timer"
    )
    DispatchQueue.main.async {
      CallKitProvider.shared.reportCallEnded(uuidString: sid, endedReason: .unanswered)
    }
    // Best-effort server PATCH — must not block local dismiss (NORMAL).
    NativeVoiceCallApi.missedAsync(callId: sid) { _, _, _ in }
  }
}
