import Foundation

/** Maps Native Video Runtime session/state to render-only UI model (Android parity). */
enum NativeVideoCallUiPresenter {
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
    let showActiveActions: Bool
    let showConnectedControls: Bool
    let showVideoSurfaces: Bool
    let showLocalPreview: Bool
    let showStatusOverlay: Bool
    let showDuration: Bool
    let endButtonLabel: String
    let cameraLabel: String
  }

  static func build(session: NativeVideoCallSession?, state: NativeVideoCallRuntimeState) -> Model {
    let peerName = resolvePeerName(session)
    let phase = resolvePhase(session: session, state: state)
    let statusText = resolveStatusText(phase: phase)
    let avatarInitial = initialFromName(peerName)
    let ending = phase == .ending
    let incoming = phase == .incoming
    let connected = phase == .connected
    let dialingOrConnecting = phase == .dialing || phase == .connecting
    let videoPhase = phase == .connecting || phase == .connected
    let endLabel = phase == .dialing ? Copy.cancel : Copy.end
    return Model(
      phase: phase,
      peerName: peerName,
      statusText: statusText,
      avatarInitial: avatarInitial,
      showIncomingActions: incoming && !ending,
      showActiveActions: (dialingOrConnecting || connected) && !ending,
      showConnectedControls: connected && !ending,
      showVideoSurfaces: videoPhase && !ending,
      showLocalPreview: videoPhase && !ending,
      showStatusOverlay: !videoPhase && !ending,
      showDuration: connected && !ending,
      endButtonLabel: endLabel,
      cameraLabel: Copy.cameraOn
    )
  }

  static func resolvePhase(
    session: NativeVideoCallSession?,
    state: NativeVideoCallRuntimeState
  ) -> Phase {
    switch state {
    case .ending, .ended, .failed:
      return .ending
    case .connected:
      return .connected
    case .ringing:
      return .incoming
    case .accepting, .connecting:
      if let session, session.initiator, state == .connecting {
        return .dialing
      }
      return .connecting
    }
  }

  private static func resolvePeerName(_ session: NativeVideoCallSession?) -> String {
    let name = session?.callerName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return name.isEmpty ? "DIBAY" : name
  }

  private static func resolveStatusText(phase: Phase) -> String {
    switch phase {
    case .incoming:
      return Copy.incoming
    case .dialing, .connecting:
      return Copy.connecting
    case .connected:
      return Copy.connected
    case .ending:
      return Copy.ending
    }
  }

  private static func initialFromName(_ name: String) -> String {
    guard let first = name.first else { return "D" }
    return String(first).uppercased()
  }

  private enum Copy {
    static let incoming = "영상 통화 수신"
    static let connecting = "연결 중…"
    static let connected = "통화 중"
    static let ending = "통화 종료 중"
    static let end = "종료"
    static let cancel = "취소"
    static let cameraOn = "카메라 켬"
    static let cameraOff = "카메라 끔"
  }

  static func cameraLabel(enabled: Bool) -> String {
    enabled ? Copy.cameraOn : Copy.cameraOff
  }
}
