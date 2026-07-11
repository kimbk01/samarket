import Foundation

/** Post-connected Web sync only. Never used to establish the call (Android `NativeVoiceCallBridge` parity). */
enum NativeVoiceCallBridge {
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

  static func clearConnectedEmit(callId: String) {
    NativeCallServicePlugin.clearNativeConnectedEmit(callId: callId)
  }

  private static func maskSessionId(_ sessionId: String) -> String {
    guard sessionId.count > 8 else { return sessionId }
    return String(sessionId.prefix(4)) + "…" + String(sessionId.suffix(4))
  }
}
