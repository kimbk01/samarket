import Foundation

/** Post-connected Web sync only. Reuses NativeCallServicePlugin emit paths (Voice parity). */
enum NativeVideoCallBridge {
  private static let connectedPublishLock = NSLock()
  private static var connectedPublishedSessions = Set<String>()

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
      NativeVideoCallLog.info(
        "ios_native_video_connected_duplicate_skipped",
        callId: sid,
        details: "source=\(source)"
      )
      return
    }

    NativeVideoCallLog.info(
      "ios_native_video_connected_state_publish_started",
      callId: sid,
      details: "source=\(source)"
    )
    syncConnected(callId: sid)
    NativeVideoCallLog.info(
      "ios_native_video_js_connected_synced",
      callId: sid,
      details: "source=\(source)"
    )
  }

  static func syncConnected(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard snap.state == .connected, let session = snap.session, session.sessionId == sid else { return }
    let direction = session.initiator ? "outgoing" : "incoming"
    NativeCallServicePlugin.publishNativeConnected(
      callId: sid,
      roomId: session.roomId,
      mediaType: "video",
      direction: direction,
      peerUserId: session.callerId,
      peerName: session.callerName,
      runtime: "native_video",
      fgsOwner: "NativeVideoCallService"
    )
  }

  static func clearConnectedPublish(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    connectedPublishLock.lock()
    connectedPublishedSessions.remove(sid)
    connectedPublishLock.unlock()
    NativeCallServicePlugin.clearNativeConnectedEmit(callId: sid)
  }

  /// Local/remote terminal — immediate Web idle so re-dial is not blocked by async cleanup.
  static func publishLocalTerminal(sessionId: String, reason: String, source: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    NativeVideoCallLog.info(
      "ios_native_video_local_terminal_publish",
      callId: sid,
      details: "reason=\(reason) source=\(source)"
    )
    NativeCallServicePlugin.publishNativeTerminal(callId: sid, reason: reason, source: source)
  }
}
