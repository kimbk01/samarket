import CallKit
import Foundation
import PushKit
import UIKit

/// VoIP push — CallKit incoming call UI (iOS 13+ requires CallKit with VoIP push).
final class VoIPPushRegistry: NSObject, PKPushRegistryDelegate {
  static let shared = VoIPPushRegistry()

  private var registry: PKPushRegistry?
  private let callProvider = CallKitProvider.shared

  func start() {
    if registry != nil { return }
    let reg = PKPushRegistry(queue: DispatchQueue.main)
    reg.delegate = self
    reg.desiredPushTypes = [.voIP]
    registry = reg
  }

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    DibayPushTokenBridge.postVoipToken(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    DibayPushTokenBridge.postVoipTokenInvalidated()
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    let data = payload.dictionaryPayload
    let sessionId = (data["sessionId"] as? String) ?? (data["session_id"] as? String) ?? UUID().uuidString
    let kind = data["call_push_kind"] as? String
    if kind == "call_canceled" || kind == "call_rejected" || kind == "call_ended" {
      let terminalReason = "ios_voip_terminal_\(kind ?? "unknown")"
      if isVoipTerminalIncomingSession(sessionId: sessionId) {
        CallV4SurfaceOwnerBridge.deliver(
          callId: sessionId,
          owner: "terminal",
          reason: terminalReason
        )
        callProvider.reportCallEnded(uuidString: sessionId)
      } else {
        DibayCallLog.infoCallV4(
          "ios_voip_terminal_bridge_skipped",
          callId: sessionId,
          owner: "terminal",
          reason: "\(terminalReason)_not_incoming"
        )
      }
      completion()
      return
    }
    let caller = (data["title"] as? String) ?? "수신 통화"
    let hasVideo = (data["kind"] as? String) == "video"
    let roomId = stringField(data, keys: ["roomId", "room_id"])
    let callerId = stringField(data, keys: ["callerId", "caller_id"])
    if NativeVoiceCallLane.isEnabled() && !hasVideo {
      DibayCallLog.infoSurfaceBridgeSkip(sessionId: sessionId, reason: "native_voice_lane")
    } else {
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "native_fsi",
        reason: "ios_callkit_incoming"
      )
    }
    callProvider.reportIncomingCall(
      uuidString: sessionId,
      handle: caller,
      hasVideo: hasVideo,
      roomId: roomId,
      callerId: callerId
    ) { error in
      if let error = error {
        DibayCallLog.infoCallV4(
          "ios_callkit_incoming_failed",
          callId: sessionId,
          owner: "error",
          reason: error.localizedDescription
        )
        CallV4SurfaceOwnerBridge.deliver(
          callId: sessionId,
          owner: "notification_fallback",
          reason: "ios_callkit_incoming_failed"
        )
      }
      completion()
    }
  }

  /// VoIP terminal dismiss applies only to registered incoming sessions — Web outgoing SSOT owns caller teardown.
  private func isVoipTerminalIncomingSession(sessionId: String) -> Bool {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }

    if let voice = NativeVoiceCallRuntime.shared.getSession(sessionId: sid) {
      return voice.direction == .incoming
    }

    if NativeVideoCallLane.isEnabled(), NativeVideoCallRuntime.shared.getSession(sessionId: sid) != nil {
      return true
    }

    return callProvider.getActiveCallSessionId() == sid
  }

  private func stringField(_ data: [AnyHashable: Any], keys: [String]) -> String? {
    for key in keys {
      if let value = data[key] as? String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
      }
    }
    return nil
  }
}
