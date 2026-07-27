import CallKit
import Foundation
import UIKit
import UserNotifications

/**
 * Canonical iOS terminal authority for CallKit dismiss.
 *
 * Entry: APNs (foreground willPresent / remote fetch / tap / cold) and VoIP terminal kinds.
 * Ends only tracked `callSessionId → CallKit UUID` mappings. Never invents UUIDs.
 */
final class CallTerminalEventHandler {
  static let shared = CallTerminalEventHandler()

  private let lock = NSLock()
  private var endedSessionIds = Set<String>()

  private init() {}

  @discardableResult
  func handleIfTerminal(
    userInfo: [AnyHashable: Any],
    source: CallTerminalSource
  ) -> Bool {
    let kind = CallTerminalDecision.canonicalizeKind(from: userInfo)
    guard let kind else { return false }
    let sessionId = CallTerminalDecision.canonicalizeSessionId(from: userInfo) ?? ""
    let occurred = CallTerminalDecision.occurredAt(from: userInfo)
    handleTerminalCallEvent(
      callSessionId: sessionId,
      kind: kind,
      source: source,
      occurredAt: occurred,
      revision: nil
    )
    return true
  }

  func handleTerminalCallEvent(
    callSessionId: String,
    kind: CallTerminalKind,
    source: CallTerminalSource,
    occurredAt: Date?,
    revision: String?
  ) {
    let sid = callSessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let appState = Self.currentAppStateLabel()
    let occurredLabel = occurredAt.map { ISO8601DateFormatter().string(from: $0) } ?? ""
    let rev = (revision ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

    DibayCallLog.info(
      "ios_terminal_payload_received",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue) appState=\(appState) occurredAt=\(occurredLabel) revision=\(rev)"
    )

    guard !sid.isEmpty else {
      DibayCallLog.info(
        "ios_terminal_payload_rejected",
        sessionId: "",
        detail: "kind=\(kind.rawValue) source=\(source.rawValue) reason=missing_session_id"
      )
      return
    }

    DibayCallLog.info(
      "ios_terminal_canonicalized",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue)"
    )

    lock.lock()
    let alreadyEnded = endedSessionIds.contains(sid)
    lock.unlock()

    let trackedUuid = CallKitProvider.shared.trackedCallKitUuid(sessionId: sid)
    let isOutgoing = CallKitProvider.shared.isOutgoingSession(sid)

    DibayCallLog.info(
      "ios_terminal_registry_lookup",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) hasTracked=\(trackedUuid != nil) isOutgoing=\(isOutgoing) uuid=\(trackedUuid?.uuidString ?? "")"
    )

    let decision = CallTerminalDecision.decide(
      CallTerminalDecisionInput(
        callSessionId: sid,
        kind: kind,
        trackedUuid: trackedUuid,
        alreadyEnded: alreadyEnded,
        isOutgoing: isOutgoing
      )
    )

    switch decision.reason {
    case .registryMiss:
      DibayCallLog.info(
        "ios_terminal_registry_miss",
        sessionId: sid,
        detail: "kind=\(kind.rawValue) source=\(source.rawValue)"
      )
      return
    case .duplicate:
      DibayCallLog.info(
        "ios_terminal_duplicate_dropped",
        sessionId: sid,
        detail: "kind=\(kind.rawValue) source=\(source.rawValue)"
      )
      return
    case .outgoingGuard:
      DibayCallLog.info(
        "ios_terminal_stale_dropped",
        sessionId: sid,
        detail: "kind=\(kind.rawValue) source=\(source.rawValue) reason=outgoing_guard"
      )
      return
    case .invalidPayload:
      DibayCallLog.info(
        "ios_terminal_payload_rejected",
        sessionId: sid,
        detail: "kind=\(kind.rawValue) source=\(source.rawValue) reason=invalid_payload"
      )
      return
    case .trackedMatch:
      break
    }

    guard decision.action == .endTracked, let uuid = trackedUuid else { return }

    DibayCallLog.info(
      "ios_terminal_callkit_end_dispatch",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue) uuid=\(uuid.uuidString) previousState=tracked_incoming"
    )

    let cxReason = CallTerminalDecision.cxEndedReason(for: kind)
    CallKitProvider.shared.endTrackedIncomingCallKitSession(
      sessionId: sid,
      reason: cxReason,
      logDetail: "ios_terminal_\(kind.rawValue)_\(source.rawValue)"
    )

    lock.lock()
    endedSessionIds.insert(sid)
    lock.unlock()

    DibayCallLog.info(
      "ios_terminal_callkit_end_applied",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue) uuid=\(uuid.uuidString) cxReason=\(String(describing: cxReason))"
    )
    DibayCallLog.info(
      "ios_terminal_registry_cleanup",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue)"
    )
    DibayCallLog.info(
      "ios_terminal_runtime_cleanup",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue)"
    )
    DibayCallLog.info(
      "ios_terminal_reincoming_ready",
      sessionId: sid,
      detail: "kind=\(kind.rawValue) source=\(source.rawValue)"
    )

    // Dismiss any leftover local notification with the same incoming-call tag if present.
    let tag = "samarket-incoming-call-\(sid)"
    UNUserNotificationCenter.current().getDeliveredNotifications { notes in
      let ids = notes
        .filter { note in
          let info = note.request.content.userInfo
          let noteSid = CallTerminalDecision.canonicalizeSessionId(from: info) ?? ""
          return noteSid == sid || note.request.identifier.contains(tag)
        }
        .map(\.request.identifier)
      if !ids.isEmpty {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
      }
    }
  }

  /// Test/reset hook — does not clear CallKit registry.
  func resetEndedMarkersForTests() {
    lock.lock()
    endedSessionIds.removeAll()
    lock.unlock()
  }

  private static func currentAppStateLabel() -> String {
    switch UIApplication.shared.applicationState {
    case .active: return "foreground"
    case .inactive: return "inactive"
    case .background: return "background"
    @unknown default: return "unknown"
    }
  }
}
