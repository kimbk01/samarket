import Foundation

/**
 * 통화 종료 판단 단일 함수 (docs/audit/call-termination-authority-audit-2026-11-01.md §2-2).
 * Android `com.dibay.app.nativecall.CallTerminationPolicy` 와 같은 판단표.
 *
 * Owner 규칙: 통화는 종료·거절·취소 버튼, 상대 종료(서버 확정), 정당한 결과(무응답·busy·복구 불가 실패)로만 끝난다.
 * 웹 미확인 요청·대체(새 수신)·비치명 오류는 살아 있는 통화를 끝내지 않는다(KEEP).
 * 「이미 끝난 세션」(none·terminal)은 사유와 관계없이 항상 정리(converge)한다 — 판단 함수가 정리를 막지 않는다.
 */
enum CallTerminationPolicy {
  enum Cause: String {
    case userEnd = "USER_END"
    case userDecline = "USER_DECLINE"
    case userCancel = "USER_CANCEL"
    /// 서버 상태로 확인된 상대 종료·취소·거절.
    case peerTerminal = "PEER_TERMINAL"
    /// 서버가 확정한 무응답.
    case noAnswer = "NO_ANSWER"
    /// 이 기기의 벨 타이머 — 서버에 missed 를 보낸다.
    case noAnswerLocalTimer = "NO_ANSWER_LOCAL_TIMER"
    case busy = "BUSY"
    /// 토큰·참가·수락 실패, Agora 치명 오류.
    case mediaFatal = "MEDIA_FATAL"
    case permissionDenied = "PERMISSION_DENIED"
    case surfaceLost = "SURFACE_LOST"
    /// 새 수신·새 발신이 기존 통화를 대체하려 함.
    case superseded = "SUPERSEDED"
    case reclaim = "RECLAIM"
    /// 웹이 보낸 서버 미확인 종료 요청.
    case webRequestUnconfirmed = "WEB_REQUEST_UNCONFIRMED"
    case unknown = "UNKNOWN"
  }

  enum Phase: String {
    case none = "NONE"
    case ringing = "RINGING"
    case establishing = "ESTABLISHING"
    case connected = "CONNECTED"
    case terminal = "TERMINAL"
  }

  enum Decision: String {
    /// 서버 PATCH(사용자·로컬 결과) 후 정리.
    case terminate = "TERMINATE"
    /// 서버가 이미 확정(또는 이미 끝난 세션) — PATCH 없이 정리.
    case converge = "CONVERGE"
    /// 아무것도 바꾸지 않고 기록만 남김.
    case keep = "KEEP"
  }

  /// 웹 endCall 사유 중 서버 상태에서 온 것. 그 외(failed 포함)는 미확인 요청.
  private static let webServerTerminalReasons: Set<String> = [
    "ended", "remote_ended", "call_ended",
    "cancelled", "canceled", "remote_cancelled", "call_cancelled", "call_canceled",
    "rejected", "declined", "remote_rejected", "call_rejected",
    "missed", "remote_missed", "call_missed", "no_answer",
    "busy", "peer_busy",
    "answered_elsewhere", "call_answered_elsewhere",
    "native_stale_terminal", "recovery_no_live_session", "remote_terminal",
  ]

  /// 서버 세션 terminal 상태 (`community_messenger_call_sessions.status`).
  private static let serverTerminalStatuses: Set<String> = [
    "ended", "cancelled", "canceled", "rejected", "missed", "failed",
  ]

  /**
   * Agora 치명 오류 코드 (AgoraErrorCode). 그 외는 기록만 하고 SDK 자동 재연결에 맡긴다.
   * 17 joinChannelRejected · 101 invalidAppId · 102 invalidChannelId · 109 tokenExpired · 110 invalidToken.
   */
  private static let agoraFatalErrors: Set<Int> = [17, 101, 102, 109, 110]

  /// AgoraConnectionState.failed — SDK 가 재연결을 포기한 상태.
  static let agoraConnectionStateFailed = 5

  static func decide(_ cause: Cause, _ phase: Phase) -> Decision {
    if phase == .terminal { return .converge }
    switch cause {
    case .userEnd, .userDecline, .userCancel:
      return .terminate
    case .peerTerminal, .busy:
      return .converge
    case .noAnswer:
      return phase == .connected ? .keep : .converge
    case .noAnswerLocalTimer:
      if phase == .ringing { return .terminate }
      return phase == .none ? .converge : .keep
    case .mediaFatal:
      return phase == .none ? .converge : .terminate
    case .permissionDenied:
      if phase == .ringing || phase == .establishing { return .terminate }
      return phase == .none ? .converge : .keep
    case .surfaceLost, .superseded, .reclaim, .webRequestUnconfirmed, .unknown:
      return phase == .none ? .converge : .keep
    }
  }

  static func causeForServerTerminalKind(_ kind: String?) -> Cause {
    let k = normalize(kind)
    if k == "missed" || k == "call_missed" || k == "missed_call" || k == "no_answer" { return .noAnswer }
    if k == "busy" || k == "peer_busy" { return .busy }
    return .peerTerminal
  }

  static func causeForWebEndReason(_ reason: String?) -> Cause {
    let r = normalize(reason)
    guard webServerTerminalReasons.contains(r) else { return .webRequestUnconfirmed }
    return causeForServerTerminalKind(r)
  }

  static func isServerTerminalStatus(_ status: String?) -> Bool {
    serverTerminalStatuses.contains(normalize(status))
  }

  static func isAgoraFatalError(_ code: Int) -> Bool {
    agoraFatalErrors.contains(code)
  }

  static func isAgoraFatalConnectionState(_ state: Int) -> Bool {
    state == agoraConnectionStateFailed
  }

  // MARK: - Phase mapping (runtime → 판단 단계)

  static func phase(voice phase: NativeVoiceCallPhase?) -> Phase {
    guard let phase else { return .none }
    switch phase {
    case .incomingPresented:
      return .ringing
    case .outgoingStarting, .accepting, .accepted, .tokenPending, .joining:
      return .establishing
    case .connected:
      return .connected
    case .idle, .rejecting, .ending, .ended, .failed:
      return .terminal
    }
  }

  static func phase(video state: NativeVideoCallRuntimeState?, initiator: Bool) -> Phase {
    guard let state else { return .none }
    switch state {
    case .ringing:
      return initiator ? .establishing : .ringing
    case .accepting, .connecting:
      return .establishing
    case .connected:
      return .connected
    case .ending, .ended, .failed:
      return .terminal
    }
  }

  /// 음성 Runtime 이 이 callId 를 갖고 있으면 그 단계, 아니면 none.
  static func voicePhase(callId: String) -> Phase {
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    guard let session = snap.session, session.sessionId == callId else { return .none }
    return phase(voice: snap.phase)
  }

  /// 영상 Runtime 이 이 callId 를 갖고 있으면 그 단계, 아니면 none.
  static func videoPhase(callId: String) -> Phase {
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard let session = snap.session, session.sessionId == callId else { return .none }
    return phase(video: snap.state, initiator: session.initiator)
  }

  /// 이 callId 를 가진 Runtime(음성 우선, 다음 영상)의 단계. 둘 다 없으면 none.
  static func runtimePhase(callId: String) -> Phase {
    let voice: Phase = voicePhase(callId: callId)
    if voice != .none { return voice }
    return videoPhase(callId: callId)
  }

  /// 아직 끝나지 않은 통화 단계(벨·연결 중·연결됨).
  static func isLive(_ phase: Phase) -> Bool {
    switch phase {
    case .ringing, .establishing, .connected:
      return true
    case .none, .terminal:
      return false
    }
  }

  /// 살아 있는(벨 제외 — 수락 이후·연결 중·발신·연결됨) 다른 통화 callId. 새 수신이 이 통화를 대체하지 못하게 한다.
  static func liveCallSessionId(excluding callId: String) -> String? {
    let voice = NativeVoiceCallRuntime.shared.snapshot()
    if let s = voice.session, s.sessionId != callId {
      let p = phase(voice: voice.phase)
      if p == .establishing || p == .connected { return s.sessionId }
    }
    let video = NativeVideoCallRuntime.shared.snapshot()
    if let s = video.session, s.sessionId != callId {
      let p = phase(video: video.state, initiator: s.initiator)
      if p == .establishing || p == .connected { return s.sessionId }
    }
    return nil
  }

  /**
   * 서버 세션 상태가 terminal 인지 확인한다(I4). 조회 실패·404·active 는 false(= 미확인 → KEEP).
   * `GET /calls/sessions/{id}` — Native 발신 감시와 같은 경로.
   */
  static func confirmServerTerminal(callId: String, source: String, completion: @escaping (Bool) -> Void) {
    NativeVoiceCallApi.fetchSessionStatusAsync(callId: callId) { status, httpStatus, _ in
      let confirmed = isServerTerminalStatus(status?.status)
      DibayCallLog.info(
        "termination_server_confirm",
        sessionId: callId,
        detail: "source=\(source) http=\(httpStatus) status=\(status?.status ?? "none") confirmed=\(confirmed)"
      )
      completion(confirmed)
    }
  }

  static func log(_ callId: String, cause: Cause, phase: Phase, decision: Decision, detail: String = "") {
    DibayCallLog.info(
      "termination_decision",
      sessionId: callId,
      detail: "cause=\(cause.rawValue) phase=\(phase.rawValue) decision=\(decision.rawValue)\(detail.isEmpty ? "" : " " + detail)"
    )
  }

  private static func normalize(_ value: String?) -> String {
    (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }
}
