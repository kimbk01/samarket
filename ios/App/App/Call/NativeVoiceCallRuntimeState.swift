import Foundation

/**
 * Phase 1-A — iOS Native Voice Runtime types / pure state contracts.
 * No CallKit / HTTP / Agora wiring in this phase.
 */

enum NativeVoiceCallDirection: String, Sendable, Equatable {
  case incoming
  case outgoing
}

struct NativeVoiceCallSession: Equatable, Sendable {
  let sessionId: String
  let callUUID: UUID
  let direction: NativeVoiceCallDirection
  let roomId: String
  let callerId: String
  let callerName: String
  let createdAt: Date

  var initiator: Bool { direction == .outgoing }
}

enum NativeVoiceCallFailure: Equatable, Sendable {
  case invalidSession
  case conflictingActiveCall
  case duplicateAction
  case acceptFailed
  case tokenFailed
  case joinFailed
  case mediaFailed
  case rejected
  case ended
  case internalInvariant
}

enum NativeVoiceCallPhase: Equatable, Sendable {
  case idle
  case incomingPresented
  case outgoingStarting
  case accepting
  case accepted
  case tokenPending
  case joining
  case connected
  case rejecting
  case ending
  case ended
  case failed(reason: NativeVoiceCallFailure)
}

enum NativeVoiceCallRuntimeError: Error, Equatable, Sendable {
  case invalidSession
  case conflictingActiveCall
  case duplicateAction
  case invalidTransition(from: NativeVoiceCallPhase, action: String)
  case internalInvariant
}

struct NativeVoiceCallRuntimeSnapshot: Equatable, Sendable {
  let session: NativeVoiceCallSession?
  let phase: NativeVoiceCallPhase
}

/**
 * Phase 2+ hook — not invoked by Phase 1-A runtime.
 */
protocol NativeVoiceCallAccepting: Sendable {
  func accept(session: NativeVoiceCallSession) async throws
}
