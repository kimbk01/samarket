import UIKit

/**
 * DIBAY Call in-app notice — iOS Native renderer (Voice/Video shared).
 * Product parity with Web CallInAppNoticeBanner / Android NativeCallInAppNoticeOverlay.
 * CallKit / system surfaces are out of scope.
 */
enum NativeCallInAppNotice {
  enum Event: String {
    case peerBusy
    case peerDeclined
    case callFailed
    case remoteEnded
    case missed
    case reconnecting
    case networkWarning
    case permissionRequired
  }

  static func mapTerminalReason(_ reason: String?) -> Event? {
    guard let raw = reason?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !raw.isEmpty else {
      return nil
    }
    if raw == "peer_busy" || raw == "callee_busy" || raw == "busy" || raw == "native_engine_busy" {
      return .peerBusy
    }
    if raw == "rejected" || raw == "reject" || raw == "declined" || raw == "call_rejected" {
      return .peerDeclined
    }
    if raw == "failed"
      || raw.hasPrefix("agora")
      || raw.contains("token")
      || raw.contains("join")
      || raw.contains("media")
      || raw.contains("accept")
    {
      if raw.contains("permission") || raw.contains("mic") || raw.contains("camera") {
        return .permissionRequired
      }
      return .callFailed
    }
    if raw == "ended"
      || raw == "remote_ended"
      || raw == "call_ended"
      || raw == "end"
      || raw == "local_ended"
      || raw == "remote_terminal"
    {
      return .remoteEnded
    }
    if raw == "missed" || raw == "missed_call" || raw == "call_missed" || raw == "timeout" {
      return .missed
    }
    if raw.contains("permission") {
      return .permissionRequired
    }
    return nil
  }

  static func mapVoiceFailure(_ failure: NativeVoiceCallFailure) -> Event {
    switch failure {
    case .rejected:
      return .peerDeclined
    case .ended:
      return .remoteEnded
    default:
      return .callFailed
    }
  }

  static func mapVideoFailure(_ failure: NativeVideoCallFailure) -> Event {
    switch failure {
    case .rejected:
      return .peerDeclined
    case .ended:
      return .remoteEnded
    case .missingCameraOrMicrophonePermission:
      return .permissionRequired
    default:
      return .callFailed
    }
  }

  static func message(for event: Event) -> String {
    // Mirrors Web `cm_ui_call_*` / Android `dibay_call_notice_*` (KO product SSOT for Native shell).
    switch event {
    case .peerBusy:
      return "상대방이 현재 통화중입니다."
    case .peerDeclined:
      return "상대방이 통화를 거절했습니다"
    case .callFailed:
      return "통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."
    case .remoteEnded:
      return "통화가 종료되었습니다"
    case .missed:
      return "부재중 알림"
    case .reconnecting:
      return "다시 연결하는 중…"
    case .networkWarning:
      return "네트워크 상태를 확인해 주세요."
    case .permissionRequired:
      return "마이크 권한이 필요합니다"
    }
  }

  static func durationMs(for event: Event) -> TimeInterval {
    switch event {
    case .reconnecting, .permissionRequired:
      return 1.6
    case .remoteEnded:
      return 3.6
    case .callFailed:
      return 4.8
    default:
      return 4.2
    }
  }

  static func backgroundColor(for event: Event) -> UIColor {
    switch event {
    case .callFailed, .permissionRequired:
      return UIColor(red: 0xD9 / 255, green: 0x30 / 255, blue: 0x25 / 255, alpha: 1)
    case .networkWarning:
      return UIColor(red: 0x1F / 255, green: 0x1F / 255, blue: 0x1F / 255, alpha: 1)
    default:
      return UIColor(red: 0x00 / 255, green: 0x75 / 255, blue: 0x4A / 255, alpha: 1)
    }
  }
}

final class NativeCallInAppNoticeOverlayView: UIView {
  private let label = UILabel()
  private let closeButton = UIButton(type: .system)
  private var dismissWorkItem: DispatchWorkItem?

  override init(frame: CGRect) {
    super.init(frame: frame)
    layer.cornerRadius = 20
    clipsToBounds = true
    label.textColor = .white
    label.font = .systemFont(ofSize: 15, weight: .semibold)
    label.numberOfLines = 3
    closeButton.setTitle("✕", for: .normal)
    closeButton.setTitleColor(.white, for: .normal)
    closeButton.addTarget(self, action: #selector(onClose), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [label, closeButton])
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 12),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
      heightAnchor.constraint(greaterThanOrEqualToConstant: 72),
      closeButton.widthAnchor.constraint(equalToConstant: 36),
      closeButton.heightAnchor.constraint(equalToConstant: 36),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func present(event: NativeCallInAppNotice.Event, in host: UIView, onComplete: (() -> Void)?) {
    dismissWorkItem?.cancel()
    backgroundColor = NativeCallInAppNotice.backgroundColor(for: event)
    label.text = NativeCallInAppNotice.message(for: event)
    translatesAutoresizingMaskIntoConstraints = false
    removeFromSuperview()
    host.addSubview(self)
    let top = host.safeAreaLayoutGuide.topAnchor
    NSLayoutConstraint.activate([
      leadingAnchor.constraint(equalTo: host.leadingAnchor, constant: 12),
      trailingAnchor.constraint(equalTo: host.trailingAnchor, constant: -12),
      topAnchor.constraint(equalTo: top, constant: 8),
    ])
    let work = DispatchWorkItem { [weak self] in
      self?.removeFromSuperview()
      onComplete?()
    }
    dismissWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + NativeCallInAppNotice.durationMs(for: event), execute: work)
  }

  @objc private func onClose() {
    dismissWorkItem?.cancel()
    removeFromSuperview()
  }
}

extension UIViewController {
  func presentCallInAppNoticeThenDismiss(event: NativeCallInAppNotice.Event?, then: @escaping () -> Void) {
    guard let event else {
      then()
      return
    }
    let banner = NativeCallInAppNoticeOverlayView(frame: .zero)
    banner.present(event: event, in: view) {
      then()
    }
  }
}
