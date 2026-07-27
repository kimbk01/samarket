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
    if kind == "call_canceled" || kind == "call_rejected" || kind == "call_ended" || kind == "missed_call" {
      let terminalReason = "ios_voip_terminal_\(kind ?? "unknown")"
      if isVoipTerminalIncomingSession(sessionId: sessionId) {
        CallV4SurfaceOwnerBridge.deliver(
          callId: sessionId,
          owner: "terminal",
          reason: terminalReason
        )
        callProvider.reportCallEnded(uuidString: sessionId)
      } else if isVoipTerminalOutgoingSession(sessionId: sessionId) {
        DibayCallLog.infoCallV4(
          "ios_voip_terminal_outgoing",
          callId: sessionId,
          owner: "terminal",
          reason: terminalReason
        )
        callProvider.reportCallEnded(uuidString: sessionId)
      } else if callProvider.hasTrackedCallKitSession(sessionId: sessionId) {
        DibayCallLog.infoCallV4(
          "ios_voip_terminal_callkit_clear",
          callId: sessionId,
          owner: "terminal",
          reason: terminalReason
        )
        callProvider.reportCallEnded(uuidString: sessionId)
      } else {
        // Unknown/orphan terminal: do NOT invent CallKit UUID / reportNewIncomingCall
        // (ae486 invent → ghost redial). PushKit completion still required.
        DibayCallLog.infoCallV4(
          "ios_voip_terminal_orphan_ignored",
          callId: sessionId,
          owner: "terminal",
          reason: terminalReason
        )
      }
      completion()
      return
    }
    let caller = (data["title"] as? String) ?? "수신 통화"
    let hasVideo = (data["kind"] as? String) == "video"
    let roomId = stringField(data, keys: ["roomId", "room_id"])
    let callerId = stringField(data, keys: ["callerId", "caller_id"])
    // Baseline (8dcfa709): queue native_fsi before CallKit so background/locked VoIP wake
    // can seed owner even when WebView is not ready yet (pendingByCallId).
    if NativeVoiceCallLane.isEnabled() && !hasVideo {
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "native_fsi",
        reason: "ios_native_voice_incoming"
      )
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

    // Ambiguous fallback — callUuidBySessionId is populated by BOTH reportIncomingCall
    // and reportOutgoingCallStarted, so a bare session-id match cannot prove direction.
    // Explicitly exclude known-outgoing sessions before trusting this fallback.
    guard callProvider.hasTrackedCallKitSession(sessionId: sid) else { return false }
    return !callProvider.isOutgoingSession(sid)
  }

  /// Outgoing native voice — callee reject/cancel must dismiss caller native UI (Android onRemoteTerminal parity).
  private func isVoipTerminalOutgoingSession(sessionId: String) -> Bool {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }

    if let voice = NativeVoiceCallRuntime.shared.getSession(sessionId: sid) {
      return voice.direction == .outgoing
    }

    if NativeVideoCallLane.isEnabled(),
       let video = NativeVideoCallRuntime.shared.getSession(sessionId: sid)
    {
      return video.initiator
    }

    return callProvider.isOutgoingSession(sid)
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
