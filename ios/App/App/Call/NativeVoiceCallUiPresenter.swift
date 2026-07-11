import Foundation

/** Maps Native Voice Runtime session/phase to render-only UI model (Android `NativeVoiceCallUiPresenter` parity). */
enum NativeVoiceCallUiPresenter {
  enum Phase: Equatable, Sendable {
    case incoming
    case dialing
    case connecting
    case connected
    case ending
  }

  struct Model: Equatable, Sendable {
    let phase: Phase
    let peerName: String
    let statusText: String
    let avatarInitial: String
    let showIncomingActions: Bool
    let showMediaActions: Bool
    let micChromeEnabled: Bool
    let showDuration: Bool
  }

  static func build(session: NativeVoiceCallSession?, phase: NativeVoiceCallPhase) -> Model {
    let peerName = resolvePeerName(session)
    let uiPhase = resolvePhase(session: session, phase: phase)
    let statusText = resolveStatusText(uiPhase)
    let avatarInitial = initialFromName(peerName)
    let ending = uiPhase == .ending
    let incoming = uiPhase == .incoming
    let connected = uiPhase == .connected
    let dialingOrConnecting = uiPhase == .dialing || uiPhase == .connecting
    return Model(
      phase: uiPhase,
      peerName: peerName,
      statusText: statusText,
      avatarInitial: avatarInitial,
      showIncomingActions: incoming && !ending,
      showMediaActions: (dialingOrConnecting || connected) && !ending,
      micChromeEnabled: connected && !ending,
      showDuration: connected && !ending
    )
  }

  static func resolvePhase(session: NativeVoiceCallSession?, phase: NativeVoiceCallPhase) -> Phase {
    switch phase {
    case .ending, .ended, .failed, .rejecting, .idle:
      return .ending
    case .connected:
      return .connected
    case .incomingPresented:
      return .incoming
    case .outgoingStarting:
      return .dialing
    case .joining:
      return .connecting
    case .accepting, .accepted, .tokenPending:
      return .connecting
    }
  }

  private static func resolvePeerName(_ session: NativeVoiceCallSession?) -> String {
    let name = session?.callerName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if name.isEmpty { return "DIBAY" }
    return sanitizeNickname(name)
  }

  private static func sanitizeNickname(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("@") { return String(trimmed.dropFirst()) }
    return trimmed
  }

  private static func initialFromName(_ peerName: String) -> String {
    let trimmed = peerName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let first = trimmed.first else { return "D" }
    return String(first).uppercased()
  }

  private static func resolveStatusText(_ phase: Phase) -> String {
    switch phase {
    case .incoming:
      return Copy.incoming
    case .dialing:
      return Copy.dialing
    case .connecting:
      return Copy.connecting
    case .connected:
      return Copy.connected
    case .ending:
      return Copy.ending
    }
  }

  private enum Copy {
    static let incoming = "음성 통화 수신"
    static let dialing = "전화 거는 중 …"
    static let connecting = "연결 중…"
    static let connected = "통화 중"
    static let ending = "통화 종료 중"
  }
}
