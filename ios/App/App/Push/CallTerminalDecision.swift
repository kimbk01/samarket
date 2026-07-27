import CallKit
import Foundation

/**
 * Pure terminal decision — keep behavior aligned with
 * `lib/call/native/ios-call-terminal-decision.ts`.
 *
 * DO NOT: invent CallKit UUIDs, call reportNewIncomingCall, or end a different sessionId.
 */
enum CallTerminalKind: String {
  case callCanceled = "call_canceled"
  case callRejected = "call_rejected"
  case callEnded = "call_ended"
  case missedCall = "missed_call"
}

enum CallTerminalSource: String {
  case apnsForeground = "apns_foreground"
  case apnsRemoteFetch = "apns_remote_fetch"
  case apnsTap = "apns_tap"
  case apnsColdLaunch = "apns_cold_launch"
  case voipPush = "voip_push"
  case plugin = "plugin"
}

enum CallTerminalDecisionAction: String {
  case endTracked = "end_tracked"
  case noop = "noop"
}

enum CallTerminalDecisionReason: String {
  case trackedMatch = "tracked_match"
  case invalidPayload = "invalid_payload"
  case registryMiss = "registry_miss"
  case duplicate = "duplicate"
  case outgoingGuard = "outgoing_guard"
}

struct CallTerminalDecisionInput {
  var callSessionId: String
  var kind: CallTerminalKind?
  var trackedUuid: UUID?
  var alreadyEnded: Bool
  var isOutgoing: Bool
}

struct CallTerminalDecisionResult {
  var action: CallTerminalDecisionAction
  var reason: CallTerminalDecisionReason
}

enum CallTerminalDecision {
  static func decide(_ input: CallTerminalDecisionInput) -> CallTerminalDecisionResult {
    let sid = input.callSessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, input.kind != nil else {
      return CallTerminalDecisionResult(action: .noop, reason: .invalidPayload)
    }
    if input.alreadyEnded {
      return CallTerminalDecisionResult(action: .noop, reason: .duplicate)
    }
    guard input.trackedUuid != nil else {
      return CallTerminalDecisionResult(action: .noop, reason: .registryMiss)
    }
    if input.isOutgoing {
      return CallTerminalDecisionResult(action: .noop, reason: .outgoingGuard)
    }
    return CallTerminalDecisionResult(action: .endTracked, reason: .trackedMatch)
  }

  static func canonicalizeSessionId(from userInfo: [AnyHashable: Any]) -> String? {
    let keys = ["sessionId", "session_id", "callId", "call_id"]
    for key in keys {
      if let raw = userInfo[key] as? String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
      }
    }
    if let data = userInfo["data"] as? [AnyHashable: Any] {
      return canonicalizeSessionId(from: data)
    }
    return nil
  }

  static func canonicalizeKind(from userInfo: [AnyHashable: Any]) -> CallTerminalKind? {
    let raw = (userInfo["call_push_kind"] as? String)
      ?? (userInfo["type"] as? String)
      ?? (userInfo["notification_type"] as? String)
    if let raw {
      let v = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if let kind = CallTerminalKind(rawValue: v) { return kind }
      switch v {
      case "community_messenger_call_canceled": return .callCanceled
      case "community_messenger_missed_call": return .missedCall
      case "cancelled", "canceled": return .callCanceled
      case "rejected": return .callRejected
      case "ended": return .callEnded
      case "missed": return .missedCall
      default: break
      }
    }
    if let data = userInfo["data"] as? [AnyHashable: Any] {
      return canonicalizeKind(from: data)
    }
    return nil
  }

  static func occurredAt(from userInfo: [AnyHashable: Any]) -> Date? {
    let keys = ["occurred_at", "occurredAt", "missedAt", "missed_at", "createdAt", "created_at"]
    for key in keys {
      if let raw = userInfo[key] as? String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }
        let isoFrac = ISO8601DateFormatter()
        isoFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = isoFrac.date(from: trimmed) { return d }
        if let d = ISO8601DateFormatter().date(from: trimmed) { return d }
      }
    }
    if let data = userInfo["data"] as? [AnyHashable: Any] {
      return occurredAt(from: data)
    }
    return nil
  }

  static func cxEndedReason(for kind: CallTerminalKind) -> CXCallEndedReason {
    switch kind {
    case .callCanceled, .missedCall:
      return .unanswered
    case .callRejected:
      return .declinedElsewhere
    case .callEnded:
      return .remoteEnded
    }
  }
}
