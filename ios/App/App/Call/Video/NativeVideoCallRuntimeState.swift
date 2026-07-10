import Foundation

/**
 * Phase B0 — iOS Native Video Runtime types / pure state contracts.
 * Mirrors Android `NativeVideoCallRuntime.State` + `Session`. No wiring in this phase.
 */

enum NativeVideoCallDirection: String, Sendable, Equatable {
  case incoming
  case outgoing
}

/// Android `NativeVideoCallRuntime.State` parity.
enum NativeVideoCallRuntimeState: Equatable, Sendable {
  case ringing
  case accepting
  case connecting
  case connected
  case ending
  case ended
  case failed
}

struct NativeVideoCallSession: Equatable, Sendable {
  let sessionId: String
  let roomId: String
  let callerId: String
  let callerName: String
  let mediaType: String
  let initiator: Bool
  let callUUID: UUID
  let createdAt: Date
}

enum NativeVideoCallFailure: Equatable, Sendable {
  case invalidSession
  case conflictingActiveCall
  case duplicateAction
  case acceptFailed
  case tokenFailed
  case joinFailed
  case mediaFailed
  case missingCameraOrMicrophonePermission
  case rejected
  case ended
  case internalInvariant
}

enum NativeVideoCallRuntimeError: Error, Equatable, Sendable {
  case invalidSession
  case conflictingActiveCall
  case duplicateAction
  case invalidTransition(from: NativeVideoCallRuntimeState, action: String)
  case internalInvariant
}

struct NativeVideoCallRuntimeSnapshot: Equatable, Sendable {
  let session: NativeVideoCallSession?
  let state: NativeVideoCallRuntimeState
}

enum NativeVideoCallLane {
  static func isVideoMediaType(_ mediaType: String?) -> Bool {
    let normalized = mediaType?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    return normalized == "video"
  }
}
