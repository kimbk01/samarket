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
      detail: "kind=\(kind ?? "incoming") \(DibayMemberEventEligibilityStore.durableSnapshotDetail())"
    )
    NativeVideoCallLog.corr("I0", callId: sessionId, details: "event=voip_push_received kind=\(kind ?? "incoming")")

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
        // Winner device already answered — do not end the live call. 통화 정상화 계획 v2 §3-2 (C1-앱):
        // 보고 없이 완료하면 iOS 규칙 위반 → 새 UUID 무음 보고 후 즉시 종료(진행 중 통화는 그대로).
        if callProvider.hasTrackedCallKitSession(sessionId: sessionId)
          || callProvider.isTerminalSuppressed(sessionId: sessionId)
        {
          DibayCallLog.infoCallV4(
            "ios_voip_answered_elsewhere_ignored_winner",
            callId: sessionId,
            owner: "terminal",
            reason: "winner_device_compliance_report"
          )
          callProvider.reportComplianceIncomingThenEnd(
            sessionId: sessionId,
            reason: "answered_elsewhere_winner",
            completion: completion
          )
          return
        }
        // True cold orphan: untracked winner wake still requires PushKit → CallKit fulfillment.
        DibayCallLog.infoCallV4(
          "ios_voip_answered_elsewhere_winner_untracked",
          callId: sessionId,
          owner: "terminal",
          reason: "report_then_end"
        )
        fulfillOrphanTerminalVoipPush(
          sessionId: sessionId,
          kind: kind,
          data: data,
          callKitEndReason: .remoteEnded,
          completion: completion
        )
        return
      }
    }

    // CUT7 #5: ringing-era terminals must not tear down post-accept / connected winner.
    // call_ended always applies (legitimate active hangup). Never blanket-ignore all terminals.
    if !shouldApplyVoipTerminal(kind: kind, sessionId: sessionId) {
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_stale_suppressed",
        callId: sessionId,
        owner: "terminal",
        reason: "kind=\(kind)_post_accept"
      )
      // 통화 정상화 계획 v2 §3-2 (C1-앱): 받은 통화는 그대로 두고 이 VoIP 만 규칙대로 보고·종료.
      callProvider.reportComplianceIncomingThenEnd(
        sessionId: sessionId,
        reason: "stale_terminal_post_accept kind=\(kind)",
        completion: completion
      )
      return
    }

    let terminalReason = "ios_voip_terminal_\(kind)"
    // CUT7 CallKit presentation mapping (server taxonomy unchanged):
    // - call_answered_elsewhere → .answeredElsewhere (#3)
    // - missed_call → .unanswered (#4, canonical missed_timeout)
    // - otherwise (cancel / reject / end) → .remoteEnded
    let callKitEndReason: CXCallEndedReason
    if kind == "call_answered_elsewhere" {
      callKitEndReason = .answeredElsewhere
    } else if kind == "missed_call" {
      callKitEndReason = .unanswered
    } else {
      callKitEndReason = .remoteEnded
    }
    // 통화 정상화 계획 v2 §3-2 (C1-앱): 「추적 중」은 앱 맵 기준이라 CallKit 이 이미 끝낸 통화일 수 있다.
    // 끝내기 전에 CallKit 이 실제로 들고 있는지 확인 — 들고 있으면 그 통화 종료로 이 VoIP 에 대응하고,
    // 이미 끝났으면 정리 후 규칙 준수 보고(새 UUID 무음 보고 → 즉시 종료)로 완료한다.
    let liveBeforeEnd = callProvider.isCallKitCallLive(sessionId: sessionId)
    let provider = callProvider
    let completeAfterTrackedEnd: (String) -> Void = { detail in
      if liveBeforeEnd {
        DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: detail)
        completion()
      } else {
        provider.reportComplianceIncomingThenEnd(
          sessionId: sessionId,
          reason: "\(detail)_callkit_not_live kind=\(kind)",
          completion: completion
        )
      }
    }
    if isVoipTerminalIncomingSession(sessionId: sessionId) {
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)
      completeAfterTrackedEnd("tracked_incoming_end")
      return
    }
    if isVoipTerminalOutgoingSession(sessionId: sessionId) {
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_outgoing",
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)
      completeAfterTrackedEnd("tracked_outgoing_end")
      return
    }
    if callProvider.hasTrackedCallKitSession(sessionId: sessionId) {
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_callkit_clear",
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)
      completeAfterTrackedEnd("tracked_callkit_end")
      return
    }

    // Already terminal-suppressed (e.g. fail_after_fulfill marked before map clear):
    // not a true cold orphan — must not re-report the SAME session (fulfillOrphan →
    // will_report_then_end → visible resurrection); report a fresh silent UUID instead.
    // Local end already closed this CallKit session (e.g. caller saw Agora remote leave before
    // the server call_ended VoIP arrived): endCallKitSession clears the map but not the
    // suppress set — treat as already terminal so the orphan path cannot re-report it as a
    // new incoming call on the device that just hung up.
    if callProvider.isTerminalSuppressed(sessionId: sessionId)
      || callProvider.isCallKitEndCompleted(sessionId: sessionId)
    {
      // 통화 정상화 계획 v2 §3-2 (C1-앱): 2026-10-22 실기기에서 이 분기의 completion-only 가 iOS 강제 종료
      // (SIGABRT) → VoIP 차단을 만들었다. 같은 세션은 되살리지 않고 새 UUID 무음 보고 후 즉시 종료.
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_already_suppressed",
        callId: sessionId,
        owner: "terminal",
        reason: "compliance_report kind=\(kind)"
      )
      callProvider.reportComplianceIncomingThenEnd(
        sessionId: sessionId,
        reason: "already_terminal kind=\(kind)",
        completion: completion
      )
      return
    }

    // Orphan terminal (cancel/missed before map / cold wake): PushKit still requires
    // reportNewIncomingCall — reuse terminal-suppress → report → immediate end.
    // DO NOT invent a random CallKit UUID; uuidFromSession uses sessionId when it is a UUID.
    fulfillOrphanTerminalVoipPush(
      sessionId: sessionId,
      kind: kind,
      data: data,
      callKitEndReason: callKitEndReason,
      completion: completion
    )
  }

  /**
   * CUT7 #5 — VoIP terminal applicability (kind + local phase + same session).
   *
   * Server evidence (`service.ts` resolveNext):
   * - cancel → `cancelled` only from ringing; active cancel remaps to `ended` → `call_ended`
   * - reject → `rejected` only from ringing
   * - missed → only from ringing
   * - end → `ended` from active (must always apply)
   *
   * Therefore late `missed_call` / `call_canceled` / `call_rejected` after local
   * accepting|accepted|connecting|connected are stale delivery vs winner session.
   * `call_ended` must never be suppressed.
   */
  private func shouldApplyVoipTerminal(kind: String, sessionId: String) -> Bool {
    if kind == "call_ended" {
      return true
    }
    let postAccept = isPostAcceptEstablishedSession(sessionId: sessionId)
    if kind == "call_answered_elsewhere" {
      // Loser still ringing/incoming → apply. Post-accept on this device ⇒ winner/stale.
      if postAccept {
        return false
      }
      return true
    }
    if kind == "missed_call" || kind == "call_canceled" || kind == "call_rejected" {
      return !postAccept
    }
    return true
  }

  /// Local runtime has already advanced past ringing for this exact sessionId.
  private func isPostAcceptEstablishedSession(sessionId: String) -> Bool {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }

    let voice = NativeVoiceCallRuntime.shared.snapshot()
    if let active = voice.session, active.sessionId == sid {
      switch voice.phase {
      case .accepting, .accepted, .tokenPending, .joining, .connected:
        return true
      case .idle, .incomingPresented, .outgoingStarting, .rejecting, .ending, .ended, .failed:
        return false
      }
    }

    if NativeVideoCallLane.isEnabled() {
      let video = NativeVideoCallRuntime.shared.snapshot()
      if let active = video.session, active.sessionId == sid {
        switch video.state {
        case .accepting, .connecting, .connected:
          return true
        case .ringing, .ending, .ended, .failed:
          return false
        }
      }
    }
    return false
  }

  private func fulfillOrphanTerminalVoipPush(
    sessionId: String,
    kind: String,
    data: [AnyHashable: Any],
    callKitEndReason: CXCallEndedReason,
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
    // CUT7 #3: stage CallKit end reason for orphan dismiss (answeredElsewhere vs remoteEnded).
    callProvider.markTerminalSuppressed(
      sessionId: sessionId,
      reason: terminalReason,
      callKitEndReason: callKitEndReason
    )
    let identity = IncomingCallCallerIdentity.resolve(from: data)
    let roomId = stringField(data, keys: ["roomId", "room_id"])
    let callerId = stringField(data, keys: ["callerId", "caller_id"])
    // Terminal orphan fulfillment is not a real incoming — force silent (same as guest/ineligible).
    callProvider.reportIncomingCall(
      uuidString: sessionId,
      callerDisplayName: identity.displayName,
      remoteHandle: identity.remoteHandle,
      hasVideo: identity.hasVideo,
      roomId: roomId,
      callerId: callerId,
      iosSoundName: nil,
      ringtonePolicy: "silent"
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
    // 통화 정상화 계획 v2 §3-2 (C1-앱): 이미 CallKit 종료까지 끝난 세션에 늦게 온 수신 VoIP —
    // 같은 UUID 재보고는 종료 단계가 생략돼(1회 종료 게이트) 무음 화면이 남을 수 있다 → 새 UUID 준수 보고.
    if callProvider.isCallKitEndCompleted(sessionId: sessionId)
      && !callProvider.isCallKitCallLive(sessionId: sessionId)
    {
      DibayCallLog.infoCall("[voip] incoming_after_callkit_end", callId: sessionId, detail: "compliance_report")
      callProvider.reportComplianceIncomingThenEnd(
        sessionId: sessionId,
        reason: "incoming_after_callkit_end",
        completion: completion
      )
      return
    }
    guard DibayMemberEventEligibilityStore.isMemberEventEligible() else {
      DibayCallLog.infoCall(
        "[voip] incoming_blocked_guest_ineligible",
        callId: sessionId,
        detail: "reason=member_event_not_eligible"
      )
      NativeVideoCallLog.corr("I1", callId: sessionId, details: "event=eligibility ok=false reason=member_event_not_eligible")
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

    let recipient = DibayMemberEventEligibilityStore.resolvePayloadRecipientUserId(from: data)
    let present = DibayMemberEventEligibilityStore.presentDecision(payloadRecipientUserId: recipient)
    guard present.ok else {
      DibayCallLog.infoCall(
        "[voip] incoming_blocked_auth_gate",
        callId: sessionId,
        detail: "reason=\(present.reason)"
      )
      NativeVideoCallLog.corr("I1", callId: sessionId, details: "event=eligibility ok=false reason=\(present.reason)")
      callProvider.markTerminalSuppressed(sessionId: sessionId, reason: present.reason)
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

    NativeVideoCallLog.corr("I1", callId: sessionId, details: "event=eligibility ok=true")
    // CONTRACT: CallKit report first — WebView / surface owner enrich after report is initiated.
    NativeVideoCallLog.corr("I2", callId: sessionId, details: "event=reportNewIncomingCall_start")
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
        NativeVideoCallLog.corr("I3", callId: sessionId, details: "event=reportNewIncomingCall_fail err=\(error.localizedDescription)")
        CallV4SurfaceOwnerBridge.deliver(
          callId: sessionId,
          owner: "notification_fallback",
          reason: "ios_callkit_incoming_failed"
        )
      } else {
        NativeVideoCallLog.corr("I3", callId: sessionId, details: "event=reportNewIncomingCall_ok")
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
