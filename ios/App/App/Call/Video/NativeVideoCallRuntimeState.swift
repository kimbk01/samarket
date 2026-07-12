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
  private static var cachedEnabled: Bool?
  private static var cachedOutgoingEnabled: Bool?

  /** B5 — bundled `dibay-call-lane.json` gate (default OFF). Android assets parity. */
  static func isEnabled() -> Bool {
    if let cached = cachedEnabled { return cached }
    let enabled = readLaneBool(key: "nativeVideoRuntime")
    cachedEnabled = enabled
    if enabled {
      NativeVideoCallLog.info("native_video_flag_enabled", callId: "unknown")
    }
    return enabled
  }

  static func isOutgoingEnabled() -> Bool {
    if let cached = cachedOutgoingEnabled { return cached }
    let enabled = readLaneBool(key: "nativeVideoOutgoingRuntime")
    cachedOutgoingEnabled = enabled
    if enabled {
      NativeVideoCallLog.info("native_video_outgoing_flag_enabled", callId: "unknown")
    }
    return enabled
  }

  static func isOutgoingVideoLaneActive(mediaType: String) -> Bool {
    isOutgoingEnabled() && isVideoMediaType(mediaType)
  }

  static func isVideoMediaType(_ mediaType: String?) -> Bool {
    let normalized = mediaType?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    return normalized == "video"
  }

  private static func readLaneBool(key: String) -> Bool {
    guard
      let url = Bundle.main.url(forResource: "dibay-call-lane", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return false
    }
    return json[key] as? Bool ?? false
  }
}
