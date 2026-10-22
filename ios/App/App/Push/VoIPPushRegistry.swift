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

  /**
   * A2 (재감사 §4-15-1): iOS 26.4+ delegate with `PKVoIPPushMetadata.mustReport`.
   * SDK header: mustReport NO (app foreground / already on a call / long-delayed push) → reporting a
   * call is not required; YES → must report or the app is terminated.
   */
  // `PKVoIPPushMetadata` exists only in the iOS 26.4+ SDK (Xcode 26.4 / Swift 6.3+). Older toolchains
  // (CI Xcode 26.3) compile without this delegate → legacy delegate only. Install/release builds must use
  // Xcode 26.4+ so iOS 26.4+ devices get `mustReport` (재감사 §4-15-1).
  #if compiler(>=6.3)
  @available(iOS 26.4, *)
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingVoIPPushWith payload: PKPushPayload,
    metadata: PKVoIPPushMetadata,
    withCompletionHandler completion: @escaping () -> Void
  ) {
    handleVoipPush(payload: payload, mustReport: metadata.mustReport, via: "metadata", completion: completion)
  }
  #endif

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
    // Legacy delegate: no mustReport → treat as "must report" (iOS < 26.4 contract).
    handleVoipPush(payload: payload, mustReport: nil, via: "legacy", completion: completion)
  }

  /// Same PKPushPayload delivered to both delegates must be processed once (strong refs keep identity unique).
  private var recentPayloads: [(payload: PKPushPayload, at: Date)] = []

  private func isDuplicateDelivery(_ payload: PKPushPayload) -> Bool {
    let now = Date()
    recentPayloads.removeAll { now.timeIntervalSince($0.at) > 10 }
    if recentPayloads.contains(where: { $0.payload === payload }) { return true }
    recentPayloads.append((payload, now))
    return false
  }

  /// - mustReport: `true`/`false` from iOS 26.4+ metadata; `nil` from the legacy delegate.
  private func handleVoipPush(
    payload: PKPushPayload,
    mustReport: Bool?,
    via: String,
    completion: @escaping () -> Void
  ) {
    let data = payload.dictionaryPayload
    let sessionId = (data["sessionId"] as? String) ?? (data["session_id"] as? String) ?? UUID().uuidString
    let kind = data["call_push_kind"] as? String
    DibayCallLog.infoCall(
      "[voip] received",
      callId: sessionId,
      detail: "kind=\(kind ?? "incoming") \(DibayMemberEventEligibilityStore.durableSnapshotDetail())"
    )
    NativeVideoCallLog.corr("I0", callId: sessionId, details: "event=voip_push_received kind=\(kind ?? "incoming")")
    // V0: which delegate, mustReport value.
    DibayCallLog.infoCall(
      "[voip] v0",
      callId: sessionId,
      detail: "via=\(via) mustReport=\(Self.mustReportLabel(mustReport)) kind=\(kind ?? "incoming")"
    )
    if isDuplicateDelivery(payload) {
      DibayCallLog.infoCall("[voip] v0_duplicate_delivery", callId: sessionId, detail: "via=\(via) action=completion")
      completion()
      return
    }

    if kind == "call_canceled" || kind == "call_rejected" || kind == "call_ended" || kind == "missed_call"
      || kind == "call_answered_elsewhere"
    {
      handleTerminalVoipPush(
        sessionId: sessionId,
        kind: kind ?? "unknown",
        data: data,
        mustReport: mustReport,
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
    mustReport: Bool?,
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
          satisfyReportObligationWithoutTouchingCall(
            sessionId: sessionId, kind: kind, data: data, mustReport: mustReport,
            branch: "winner_tracked", completion: completion
          )
          return
        }
        // Already-terminal known session (e.g. call_ended cleared CallKit map +
        // terminalSuppressed) is NOT a true cold orphan. Completion-only — do not
        // re-report CallKit (no generation bump / re-bell / resurrection).
        if callProvider.isTerminalSuppressed(sessionId: sessionId) {
          DibayCallLog.infoCallV4(
            "ios_voip_answered_elsewhere_winner_terminal_suppressed",
            callId: sessionId,
            owner: "terminal",
            reason: "completion_only"
          )
          satisfyReportObligationWithoutTouchingCall(
            sessionId: sessionId, kind: kind, data: data, mustReport: mustReport,
            branch: "winner_untracked_terminal_suppressed", completion: completion
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
        if mustReport == false {
          skipReportNotRequired(
            sessionId: sessionId, kind: kind, branch: "winner_untracked", markSuppressed: true, completion: completion
          )
          return
        }
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
      satisfyReportObligationWithoutTouchingCall(
        sessionId: sessionId, kind: kind, data: data, mustReport: mustReport,
        branch: "stale_terminal_suppressed", completion: completion
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
    if isVoipTerminalIncomingSession(sessionId: sessionId) {
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "terminal",
        reason: terminalReason
      )
      callProvider.reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)
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
      callProvider.reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)
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
      callProvider.reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)
      DibayCallLog.infoCall("[voip] completion", callId: sessionId, detail: "tracked_callkit_end")
      completion()
      return
    }

    // Already terminal-suppressed (e.g. fail_after_fulfill marked before map clear):
    // not a true cold orphan — completion-only. fulfillOrphan would still
    // reportNewIncomingCall (will_report_then_end) and cause visible resurrection.
    // Local end already closed this CallKit session (e.g. caller saw Agora remote leave before
    // the server call_ended VoIP arrived): endCallKitSession clears the map but not the
    // suppress set — treat as already terminal so the orphan path cannot re-report it as a
    // new incoming call on the device that just hung up.
    if callProvider.isTerminalSuppressed(sessionId: sessionId)
      || callProvider.isCallKitEndCompleted(sessionId: sessionId)
    {
      DibayCallLog.infoCallV4(
        "ios_voip_terminal_already_suppressed",
        callId: sessionId,
        owner: "terminal",
        reason: "completion_only kind=\(kind)"
      )
      satisfyReportObligationWithoutTouchingCall(
        sessionId: sessionId, kind: kind, data: data, mustReport: mustReport,
        branch: "already_terminal_suppressed", completion: completion
      )
      return
    }

    // Orphan terminal (cancel/missed before map / cold wake): PushKit still requires
    // reportNewIncomingCall — reuse terminal-suppress → report → immediate end.
    // DO NOT invent a random CallKit UUID; uuidFromSession uses sessionId when it is a UUID.
    if mustReport == false {
      skipReportNotRequired(
        sessionId: sessionId, kind: kind, branch: "orphan", markSuppressed: true, completion: completion
      )
      return
    }
    fulfillOrphanTerminalVoipPush(
      sessionId: sessionId,
      kind: kind,
      data: data,
      callKitEndReason: callKitEndReason,
      completion: completion
    )
  }

  /**
   * A2 (재감사 §4-15-1): branches whose CallKit call must NOT be ended (live / winner / already ended).
   * Previously completion-only (iOS terminated the app when a report was required → VoIP blocked).
   * - mustReport == false (iOS 26.4+ says no report needed): completion only — no CallKit API.
   * - otherwise: report this session's UUID via `reportForPushObligation`, which never touches a
   *   live call/runtime/maps; a call created by that report is ended at once. iOS < 26.4: whether a
   *   duplicate-UUID error counts as "reported" is NOT verified (NOT_PROVEN).
   */
  private func satisfyReportObligationWithoutTouchingCall(
    sessionId: String,
    kind: String,
    data: [AnyHashable: Any],
    mustReport: Bool?,
    branch: String,
    completion: @escaping () -> Void
  ) {
    if mustReport == false {
      skipReportNotRequired(
        sessionId: sessionId, kind: kind, branch: branch,
        markSuppressed: !callMayBeLive(branch: branch), completion: completion
      )
      return
    }
    let identity = IncomingCallCallerIdentity.resolve(from: data)
    callProvider.reportForPushObligation(
      sessionId: sessionId,
      callerDisplayName: identity.displayName,
      hasVideo: identity.hasVideo
    ) { result in
      DibayCallLog.infoCall(
        "[voip] v0_action",
        callId: sessionId,
        detail: "branch=\(branch) kind=\(kind) mustReport=\(Self.mustReportLabel(mustReport)) action=obligation_report result=\(result)"
      )
      completion()
    }
  }

  private func skipReportNotRequired(
    sessionId: String,
    kind: String,
    branch: String,
    markSuppressed: Bool,
    completion: @escaping () -> Void
  ) {
    // Late-incoming guard only for sessions that are NOT live (orphan / already ended). Never on a
    // live call: the suppress flag makes Agora-disconnect cleanup skip (A5 path) → stuck call.
    if markSuppressed {
      callProvider.markTerminalSuppressed(sessionId: sessionId, reason: "must_report_false_\(kind)")
    }
    DibayCallLog.infoCall(
      "[voip] v0_action",
      callId: sessionId,
      detail: "branch=\(branch) kind=\(kind) mustReport=NO action=completion_not_required"
    )
    completion()
  }

  /// W1 (winner_tracked) and S1 (stale_terminal_suppressed) can be a live CallKit call.
  private func callMayBeLive(branch: String) -> Bool {
    branch == "winner_tracked" || branch == "stale_terminal_suppressed"
  }

  private static func mustReportLabel(_ value: Bool?) -> String {
    guard let value else { return "n/a" }
    return value ? "YES" : "NO"
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
