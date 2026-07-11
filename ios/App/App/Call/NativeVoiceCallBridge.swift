import Foundation

/** Post-connected Web sync only. Never used to establish the call (Android `NativeVoiceCallBridge` parity). */
enum NativeVoiceCallBridge {
  private static let connectedPublishLock = NSLock()
  private static var connectedPublishedSessions = Set<String>()

  /// Agora connected — runtime mark + active session + JS event (idempotent per sessionId).
  static func publishConnectedState(sessionId: String, source: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }

    connectedPublishLock.lock()
    let isDuplicate = connectedPublishedSessions.contains(sid)
    if !isDuplicate {
      connectedPublishedSessions.insert(sid)
    }
    connectedPublishLock.unlock()

    if isDuplicate {
      DibayCallLog.info(
        "ios_native_voice_connected_duplicate_skipped",
        sessionId: sid,
        detail: "source=\(source)"
      )
      return
    }

    DibayCallLog.info(
      "ios_native_voice_connected_state_publish_started",
      sessionId: sid,
      detail: "source=\(source)"
    )

    do {
      try NativeVoiceCallRuntime.shared.markConnected(sessionId: sid)
    } catch {
      connectedPublishLock.lock()
      connectedPublishedSessions.remove(sid)
      connectedPublishLock.unlock()
      DibayCallLog.warn(
        "ios_native_voice_connected_publish_failed",
        sessionId: sid,
        detail: "source=\(source) err=\(String(describing: error))"
      )
      return
    }
    DibayCallLog.info("ios_native_voice_connected", sessionId: sid, detail: "source=\(source)")

    DibayActiveCallSessionManager.shared.bindActiveCall(callId: sid, mediaType: "voice", phase: "CONNECTED")
    DibayCallLog.info(
      "ios_native_voice_active_session_bound",
      sessionId: sid,
      detail: "source=\(source)"
    )

    syncConnected(callId: sid)
    DibayCallLog.info(
      "ios_native_voice_js_connected_synced",
      sessionId: sid,
      detail: "source=\(source)"
    )
  }

  static func syncConnected(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    guard snap.phase == .connected, let session = snap.session, session.sessionId == sid else { return }
    let direction = session.direction == .outgoing ? "outgoing" : "incoming"
    DibayCallLog.infoConnectedEmit(sessionId: sid, direction: direction)
    NativeCallServicePlugin.publishNativeConnected(
      callId: sid,
      roomId: session.roomId,
      mediaType: "voice",
      direction: direction,
      peerUserId: session.callerId,
      peerName: session.callerName,
      runtime: "native_voice",
      fgsOwner: "NativeVoiceCallService"
    )
  }

  static func clearConnectedPublish(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    connectedPublishLock.lock()
    connectedPublishedSessions.remove(sid)
    connectedPublishLock.unlock()
    clearConnectedEmit(callId: sid)
  }

  static func clearConnectedEmit(callId: String) {
    NativeCallServicePlugin.clearNativeConnectedEmit(callId: callId)
  }

  /// Local end tapped — notify Web immediately so re-dial is not blocked by async HTTP cleanup.
  static func publishLocalTerminal(sessionId: String, reason: String, source: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    DibayCallLog.info(
      "ios_native_voice_local_terminal_publish",
      sessionId: sid,
      detail: "reason=\(reason) source=\(source)"
    )
    NativeCallServicePlugin.publishNativeTerminal(callId: sid, reason: reason, source: source)
  }
}
