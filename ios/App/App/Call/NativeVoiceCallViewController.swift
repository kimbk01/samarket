import UIKit

/** Native-only voice call UI. Render-only over NativeVoiceCallRuntime state (Android Activity parity). */
final class NativeVoiceCallViewController: UIViewController {
  let boundCallId: String

  private let session: NativeVoiceCallSession
  private var speakerEnabledChrome = false
  private var micMutedChrome = false
  private var connectedAt: Date?
  private var durationTimer: Timer?
  private var endInFlight = false

  private let contentRoot = UIView()
  private let avatarInitialLabel = UILabel()
  private let peerNameLabel = UILabel()
  private let statusLabel = UILabel()
  private let durationLabel = UILabel()
  private let mediaActions = UIStackView()
  private let speakerButton = UIButton(type: .system)
  private let videoButton = UIButton(type: .system)
  private let muteButton = UIButton(type: .system)
  private let endButton = UIButton(type: .system)
  private let speakerLabel = UILabel()
  private let videoLabel = UILabel()
  private let muteLabel = UILabel()
  private let endLabel = UILabel()

  init(callId: String, session: NativeVoiceCallSession) {
    self.boundCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    self.session = session
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.11, green: 0.09, blue: 0.14, alpha: 1)
    buildLayout()
    bindActions()
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    if snap.session?.sessionId == boundCallId {
      applySnapshot(snap)
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    stopDurationTimer()
  }

  func applySnapshot(_ snapshot: NativeVoiceCallRuntimeSnapshot) {
    guard snapshot.session?.sessionId == boundCallId else { return }
    let model = NativeVoiceCallUiPresenter.build(session: snapshot.session, phase: snapshot.phase)
    applyModel(model)
  }

  private func applyModel(_ model: NativeVoiceCallUiPresenter.Model) {
    peerNameLabel.text = model.peerName
    statusLabel.text = model.statusText
    avatarInitialLabel.text = model.avatarInitial
    mediaActions.isHidden = !model.showMediaActions

    if model.showDuration {
      if connectedAt == nil { connectedAt = Date() }
      durationLabel.isHidden = false
      startDurationTimer()
    } else {
      stopDurationTimer()
      connectedAt = nil
      durationLabel.isHidden = true
    }

    updateControlChrome(micChromeEnabled: model.micChromeEnabled)
  }

  private func updateControlChrome(micChromeEnabled: Bool) {
    applyMediaDisk(
      button: speakerButton,
      label: speakerLabel,
      active: speakerEnabledChrome,
      disabled: false,
      danger: false
    )
    speakerButton.setImage(
      UIImage(systemName: speakerEnabledChrome ? "speaker.wave.2.fill" : "speaker.slash.fill"),
      for: .normal
    )
    speakerLabel.text = "스피커"

    applyMediaDisk(button: videoButton, label: videoLabel, active: false, disabled: true, danger: false)
    videoButton.setImage(UIImage(systemName: "video.fill"), for: .normal)
    videoLabel.text = "영상"
    videoButton.isUserInteractionEnabled = false

    let micActive = !micMutedChrome
    applyMediaDisk(
      button: muteButton,
      label: muteLabel,
      active: micActive,
      disabled: !micChromeEnabled,
      danger: false
    )
    muteButton.setImage(
      UIImage(systemName: micActive ? "mic.fill" : "mic.slash.fill"),
      for: .normal
    )
    muteLabel.text = micMutedChrome ? "음소거 해제" : "음소거"
    muteButton.isUserInteractionEnabled = micChromeEnabled

    applyMediaDisk(button: endButton, label: endLabel, active: false, disabled: false, danger: true)
    endButton.setImage(UIImage(systemName: "phone.down.fill"), for: .normal)
    endLabel.text = "종료"
    endButton.isUserInteractionEnabled = !endInFlight
  }

  private func applyMediaDisk(
    button: UIButton,
    label: UILabel,
    active: Bool,
    disabled: Bool,
    danger: Bool
  ) {
    if danger {
      button.backgroundColor = UIColor(red: 0.86, green: 0.2, blue: 0.24, alpha: 1)
      button.tintColor = .white
      button.alpha = 1
    } else if disabled {
      button.backgroundColor = UIColor(white: 0.22, alpha: 1)
      button.tintColor = .white
      button.alpha = 0.4
    } else {
      button.alpha = 1
      if active {
        button.backgroundColor = UIColor(red: 0.78, green: 0.9, blue: 0.55, alpha: 1)
        button.tintColor = UIColor(red: 0.12, green: 0.18, blue: 0.08, alpha: 1)
      } else {
        button.backgroundColor = UIColor(white: 0.22, alpha: 1)
        button.tintColor = .white
      }
    }
    label.textColor = UIColor(white: 0.95, alpha: 1)
    label.alpha = disabled ? 0.4 : 1
  }

  private func buildLayout() {
    contentRoot.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(contentRoot)
    NSLayoutConstraint.activate([
      contentRoot.topAnchor.constraint(equalTo: view.topAnchor),
      contentRoot.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      contentRoot.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      contentRoot.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    avatarInitialLabel.font = .systemFont(ofSize: 36, weight: .bold)
    avatarInitialLabel.textAlignment = .center
    avatarInitialLabel.textColor = UIColor(red: 0.45, green: 0.32, blue: 0.72, alpha: 1)
    avatarInitialLabel.backgroundColor = UIColor(red: 0.93, green: 0.9, blue: 0.98, alpha: 1)
    avatarInitialLabel.layer.cornerRadius = 56
    avatarInitialLabel.clipsToBounds = true
    avatarInitialLabel.translatesAutoresizingMaskIntoConstraints = false

    peerNameLabel.font = .systemFont(ofSize: 24, weight: .bold)
    peerNameLabel.textColor = .white
    peerNameLabel.textAlignment = .center
    statusLabel.font = .systemFont(ofSize: 16)
    statusLabel.textColor = UIColor(white: 0.72, alpha: 1)
    statusLabel.textAlignment = .center
    durationLabel.font = .monospacedDigitSystemFont(ofSize: 18, weight: .regular)
    durationLabel.textColor = .white
    durationLabel.textAlignment = .center
    durationLabel.isHidden = true

    let infoStack = UIStackView(arrangedSubviews: [avatarInitialLabel, peerNameLabel, statusLabel, durationLabel])
    infoStack.axis = .vertical
    infoStack.spacing = 12
    infoStack.alignment = .center
    infoStack.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      avatarInitialLabel.widthAnchor.constraint(equalToConstant: 112),
      avatarInitialLabel.heightAnchor.constraint(equalToConstant: 112),
    ])

    mediaActions.axis = .horizontal
    mediaActions.distribution = .fillEqually
    mediaActions.spacing = 8
    mediaActions.translatesAutoresizingMaskIntoConstraints = false
    mediaActions.isHidden = true

    let controls: [(UIButton, UILabel)] = [
      (speakerButton, speakerLabel),
      (videoButton, videoLabel),
      (muteButton, muteLabel),
      (endButton, endLabel),
    ]
    for (button, label) in controls {
      let column = UIStackView(arrangedSubviews: [button, label])
      column.axis = .vertical
      column.alignment = .center
      column.spacing = 8
      button.translatesAutoresizingMaskIntoConstraints = false
      NSLayoutConstraint.activate([
        button.widthAnchor.constraint(equalToConstant: 56),
        button.heightAnchor.constraint(equalToConstant: 56),
      ])
      button.layer.cornerRadius = 28
      button.clipsToBounds = true
      label.font = .systemFont(ofSize: 12)
      label.textAlignment = .center
      mediaActions.addArrangedSubview(column)
    }

    contentRoot.addSubview(infoStack)
    contentRoot.addSubview(mediaActions)
    NSLayoutConstraint.activate([
      infoStack.centerXAnchor.constraint(equalTo: contentRoot.centerXAnchor),
      infoStack.centerYAnchor.constraint(equalTo: contentRoot.centerYAnchor, constant: -48),
      infoStack.leadingAnchor.constraint(greaterThanOrEqualTo: contentRoot.leadingAnchor, constant: 24),
      infoStack.trailingAnchor.constraint(lessThanOrEqualTo: contentRoot.trailingAnchor, constant: -24),
      mediaActions.leadingAnchor.constraint(equalTo: contentRoot.leadingAnchor, constant: 20),
      mediaActions.trailingAnchor.constraint(equalTo: contentRoot.trailingAnchor, constant: -20),
      mediaActions.bottomAnchor.constraint(equalTo: contentRoot.safeAreaLayoutGuide.bottomAnchor, constant: -32),
    ])
  }

  private func bindActions() {
    speakerButton.addTarget(self, action: #selector(onSpeakerTapped), for: .touchUpInside)
    muteButton.addTarget(self, action: #selector(onMuteTapped), for: .touchUpInside)
    endButton.addTarget(self, action: #selector(onEndTapped), for: .touchUpInside)
  }

  @objc private func onSpeakerTapped() {
    speakerEnabledChrome.toggle()
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    let model = NativeVoiceCallUiPresenter.build(session: snap.session, phase: snap.phase)
    updateControlChrome(micChromeEnabled: model.micChromeEnabled)
  }

  @objc private func onMuteTapped() {
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    let model = NativeVoiceCallUiPresenter.build(session: snap.session, phase: snap.phase)
    guard model.micChromeEnabled else { return }
    micMutedChrome.toggle()
    updateControlChrome(micChromeEnabled: model.micChromeEnabled)
  }

  @objc private func onEndTapped() {
    guard !endInFlight else { return }
    endInFlight = true
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    let model = NativeVoiceCallUiPresenter.build(session: snap.session, phase: snap.phase)
    updateControlChrome(micChromeEnabled: model.micChromeEnabled)
    DibayCallLog.info("ios_native_voice_ui_end_tapped", sessionId: boundCallId)
    NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: boundCallId) { [weak self] in
      self?.endInFlight = false
    }
  }

  private func startDurationTimer() {
    guard durationTimer == nil else { return }
    updateDurationLabel()
    durationTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      self?.updateDurationLabel()
    }
  }

  private func stopDurationTimer() {
    durationTimer?.invalidate()
    durationTimer = nil
  }

  private func updateDurationLabel() {
    guard let connectedAt else {
      durationLabel.text = "00:00"
      return
    }
    let elapsed = max(0, Int(Date().timeIntervalSince(connectedAt)))
    let minutes = elapsed / 60
    let seconds = elapsed % 60
    durationLabel.text = String(format: "%02d:%02d", minutes, seconds)
  }
}
