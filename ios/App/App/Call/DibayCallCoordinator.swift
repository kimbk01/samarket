import Foundation

/** Who initiated reject/end — controls CallKit provider reporting to avoid double-dismiss. */
enum NativeVoiceCallEndOrigin {
  /** User ended via CallKit system UI — `CXEndCallAction.fulfill()` owns provider dismiss. */
  case callKitSystemAction
  /** Native in-app UI (e.g. `NativeVoiceCallViewController` end button). */
  case nativeAppUi
}

/**
 * Phase 1 — single SSOT coordinator for native voice call layers.
 * CallKit / Runtime / SessionManager / JS bridge must not diverge outside this type.
 */
final class DibayCallCoordinator {
  static let shared = DibayCallCoordinator()

  private let syncQueue = DispatchQueue(label: "com.dibay.app.dibay-call-coordinator")
  private var rejectOrEndInFlight: Set<String> = []
  private var connectedBridgeEmitted: Set<String> = []

  private init() {}

  // MARK: - CallKit entry (idempotent wrappers)

  func handleCallKitAnswer(sessionId: String, completion: @escaping (_ fulfill: Bool) -> Void) {
    let sid = normalize(sessionId)
    guard !sid.isEmpty else {
      completion(false)
      return
    }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    if snap.session?.sessionId == sid, isDuplicateAnswerPhase(snap.phase) {
      log("ios_call_coordinator_answer_duplicate", sid, "phase=\(snap.phase.ssotLabel)")
      completion(true)
      return
    }
    NativeVoiceIncomingCallCoordinator.shared.handleAnswer(sessionId: sid, completion: completion)
  }

  func handleCallKitRejectOrEnd(
    sessionId: String,
    origin: NativeVoiceCallEndOrigin = .nativeAppUi,
    completion: @escaping () -> Void
  ) {
    let sid = normalize(sessionId)
    guard !sid.isEmpty else {
      completion()
      return
    }
    let shouldRun: Bool = syncQueue.sync {
      if rejectOrEndInFlight.contains(sid) { return false }
      rejectOrEndInFlight.insert(sid)
      return true
    }
    guard shouldRun else {
      log("ios_call_coordinator_end_duplicate", sid, "reason=reject_or_end_in_flight")
      completion()
      return
    }
    NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sid, origin: origin) { [weak self] in
      self?.syncQueue.sync { self?.rejectOrEndInFlight.remove(sid) }
      completion()
    }
  }

  func handleRemoteTerminal(sessionId: String) {
    let sid = normalize(sessionId)
    guard !sid.isEmpty else { return }
    NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: sid)
  }

  // MARK: - Runtime snapshot fan-out

  func onRuntimeSnapshot(_ snapshot: NativeVoiceCallRuntimeSnapshot, source: String) {
    DibayActiveCallSessionManager.shared.applyVoiceRuntimeSnapshot(snapshot, source: source)
    logPhaseParity(snapshot: snapshot, source: source)

    guard let session = snapshot.session else { return }
    let sid = session.sessionId

    if snapshot.phase == .connected {
      let firstEmit: Bool = syncQueue.sync {
        if connectedBridgeEmitted.contains(sid) { return false }
        connectedBridgeEmitted.insert(sid)
        return true
      }
      if firstEmit {
        NativeVoiceCallBridge.syncConnected(callId: sid)
      }
    }

    if isTerminalVoicePhase(snapshot.phase) {
      syncQueue.sync { connectedBridgeEmitted.remove(sid) }
      NativeVoiceCallBridge.clearConnectedEmit(callId: sid)
    }
  }

  func notifyVoiceCleanupCompleted(sessionId: String, reason: String) {
    let sid = normalize(sessionId)
    syncQueue.sync { connectedBridgeEmitted.remove(sid) }
    NativeVoiceCallBridge.clearConnectedEmit(callId: sid)
    log("ios_call_coordinator_cleanup_done", sid, "reason=\(reason)")
  }

  // MARK: - Private

  private func isDuplicateAnswerPhase(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .accepting, .accepted, .tokenPending, .joining, .connected:
      return true
    default:
      return false
    }
  }

  private func isTerminalVoicePhase(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .ended, .ending, .failed, .idle:
      return true
    default:
      return false
    }
  }

  private func logPhaseParity(snapshot: NativeVoiceCallRuntimeSnapshot, source: String) {
    let runtimeLabel = snapshot.phase.ssotLabel
    let managerLabel = DibayActiveCallSessionManager.shared.voiceSsotPhaseLabel
    let sessionId = snapshot.session?.sessionId ?? "none"
    DibayCallLog.infoParity(
      ok: runtimeLabel == managerLabel,
      sessionId: sessionId,
      runtime: runtimeLabel,
      manager: managerLabel,
      source: source
    )
  }

  private func normalize(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    DibayCallLog.info(event, sessionId: sessionId, detail: extra)
  }

  private func maskSessionId(_ sessionId: String) -> String {
    DibayCallLog.mask(sessionId)
  }
}

extension NativeVoiceCallPhase {
  /** Canonical SSOT label shared by Runtime and SessionManager. */
  var ssotLabel: String {
    switch self {
    case .idle:
      return "IDLE"
    case .incomingPresented:
      return "RINGING"
    case .outgoingStarting:
      return "DIALING"
    case .accepting:
      return "ACCEPTING"
    case .accepted:
      return "ACCEPTED"
    case .tokenPending:
      return "TOKEN_PENDING"
    case .joining:
      return "CONNECTING"
    case .connected:
      return "CONNECTED"
    case .rejecting:
      return "REJECTING"
    case .ending:
      return "ENDING"
    case .ended:
      return "ENDED"
    case .failed:
      return "FAILED"
    }
  }
}
