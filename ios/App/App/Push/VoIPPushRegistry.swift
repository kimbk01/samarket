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
    DibayCallLog.infoCall(
      "[voip] received",
      callId: sessionId,
      detail: "kind=\(kind ?? "incoming")"
    )

    if kind == "call_canceled" || kind == "call_rejected" || kind == "call_ended" || kind == "missed_call"
      || kind == "call_answered_elsewhere"
    {
      handleTerminalVoipPush(
        sessionId: sessionId,
        kind: kind ?? "unknown",
        data: data,
        completion: completion
      )
      return
    }

    reportIncomingFromVoipPayload(sessionId: sessionId, data: data, completion: completion)
  }

  /**
   * Terminal VoIP (cancel / reject / end / missed / answered_elsewhere).
   * CONTRACT (iOS 13+): every PushKit VoIP wake must establish a CallKit incoming report
   * for this push — or end an already-tracked CallKit UUID. Never completion-only when
   * CallKit has never seen this session (orphan / cold / race).
   */
  private func handleTerminalVoipPush(
    sessionId: String,
    kind: String,
    data: [AnyHashable: Any],
    completion: @escaping () -> Void
  ) {
    if kind == "call_answered_elsewhere" {
      let answered =
        (data["answeredDeviceId"] as? String)
        ?? (data["answered_device_id"] as? String)
        ?? ""
      if let local = DibayCanonicalDeviceIdStore.resolveCached(),
        !answered.isEmpty,
        answered == local
      {
        // Winner device already answered — CallKit must already own this UUID from the
        // earlier incoming report / answer path. Do not end the live call.
        if callProvider.hasTrackedCallKitSession(sessionId: sessionId) {
          DibayCallLog.infoCallV4(
            "ios_voip_answered_elsewhere_ignored_winner",
            callId: sessionId,
            owner: "terminal",
            reason: "winner_device"
          )
          DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "winner_tracked")
          completion()
          return
        }
        // Untracked winner wake still requires PushKit → CallKit fulfillment.
        DibayCallLog.infoCallV4(
          "ios_voip_answered_elsewhere_winner_untracked",
          callId: sessionId,
          owner: "terminal",
          reason: "report_then_end"
        )
        fulfillOrphanTerminalVoipPush(sessionId: sessionId, kind: kind, data: data, completion: completion)
        return
      }
    }

    let terminalReason = "ios_voip_terminal_\(kind)"
    if isVoipTerminalIncomingSession(sessionId: sessionId) {
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId)
      DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "tracked_incoming_end")
      completion()
      return
    }
    if isVoipTerminalOutgoingSession(sessionId: sessionId) {
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_outgoing",
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId)
      DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "tracked_outgoing_end")
      completion()
      return
    }
    if callProvider.hasTrackedCallKitSession(sessionId: sessionId) {
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_callkit_clear",
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId)
      DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "tracked_callkit_end")
      completion()
      return
    }

    // Orphan terminal (cancel/missed before map / cold wake): PushKit still requires
    // reportNewIncomingCall — reuse terminal-suppress → report → immediate end.
    // DO NOT invent a random CallKit UUID; uuidFromSession uses sessionId when it is a UUID.
    fulfillOrphanTerminalVoipPush(sessionId: sessionId, kind: kind, data: data, completion: completion)
  }

  private func fulfillOrphanTerminalVoipPush(
    sessionId: String,
    kind: String,
    data: [AnyHashable: Any],
    completion: @escaping () -> Void
  ) {
    let terminalReason = "ios_voip_terminal_\(kind)"
    DibayCallLog.infoCallV4(
      "ios_voip_terminal_orphan_report_then_end",
      callId: sessionId,
      owner: "terminal",
      reason: terminalReason
    )
    CallV4SurfaceOwnerBridge.deliver(
      callId: sessionId,
      owner: "terminal",
      reason: terminalReason
    )
    // Mark first so reportIncomingCall takes the existing report-then-end path
    // (no ghost ring). Deterministic UUID from sessionId — no random invent.
    callProvider.markTerminalSuppressed(sessionId: sessionId, reason: terminalReason)
    let identity = IncomingCallCallerIdentity.resolve(from: data)
    let roomId = stringField(data, keys: ["roomId", "room_id"])
    let callerId = stringField(data, keys: ["callerId", "caller_id"])
    let iosSoundName = stringField(data, keys: ["ios_sound_name", "iosSoundName", "sound"])
    let ringtonePolicy = stringField(data, keys: ["ringtone_policy", "ringtonePolicy"])
    callProvider.reportIncomingCall(
      uuidString: sessionId,
      callerDisplayName: identity.displayName,
      remoteHandle: identity.remoteHandle,
      hasVideo: identity.hasVideo,
      roomId: roomId,
      callerId: callerId,
      iosSoundName: iosSoundName,
      ringtonePolicy: ringtonePolicy
    ) { error in
      if let error = error {
        DibayCallLog.infoCallV4(
          "ios_callkit_orphan_terminal_report_failed",
          callId: sessionId,
          owner: "error",
          reason: error.localizedDescription
        )
      }
      DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "orphan_report_then_end")
      completion()
    }
  }

  private func reportIncomingFromVoipPayload(
    sessionId: String,
    data: [AnyHashable: Any],
    completion: @escaping () -> Void
  ) {
    guard DibayMemberEventEligibilityStore.isMemberEventEligible() else {
      DibayCallLog.infoCall(
        "[voip] incoming_blocked_guest_ineligible",
        callId: sessionId,
        detail: "reason=member_event_not_eligible"
      )
      // PushKit requires CallKit report — reuse terminal-suppress → report → immediate end.
      callProvider.markTerminalSuppressed(sessionId: sessionId, reason: "guest_ineligible")
      let identity = IncomingCallCallerIdentity.resolve(from: data)
      callProvider.reportIncomingCall(
        uuidString: sessionId,
        callerDisplayName: identity.displayName,
        remoteHandle: identity.remoteHandle,
        hasVideo: identity.hasVideo,
        roomId: stringField(data, keys: ["roomId", "room_id"]),
        callerId: stringField(data, keys: ["callerId", "caller_id"]),
        iosSoundName: nil,
        ringtonePolicy: "silent"
      ) { _ in
        completion()
      }
      return
    }

    let identity = IncomingCallCallerIdentity.resolve(from: data)
    let roomId = stringField(data, keys: ["roomId", "room_id"])
    let callerId = stringField(data, keys: ["callerId", "caller_id"])
    let iosSoundName = stringField(data, keys: ["ios_sound_name", "iosSoundName", "sound"])
    let ringtonePolicy = stringField(data, keys: ["ringtone_policy", "ringtonePolicy"])

    // CONTRACT: CallKit report first — WebView / surface owner enrich after report is initiated.
    callProvider.reportIncomingCall(
      uuidString: sessionId,
      callerDisplayName: identity.displayName,
      remoteHandle: identity.remoteHandle,
      hasVideo: identity.hasVideo,
      roomId: roomId,
      callerId: callerId,
      iosSoundName: iosSoundName,
      ringtonePolicy: ringtonePolicy
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
      DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "incoming")
      completion()
    }

    if NativeVoiceCallLane.isEnabled() && !identity.hasVideo {
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
