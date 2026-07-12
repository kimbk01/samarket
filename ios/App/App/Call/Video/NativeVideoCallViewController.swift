import AVFoundation
import AVKit
import CallKit
import UIKit

/** Native-only video call UI. Never hosts WebView. Render-only over NativeVideoCallRuntime state. */
final class NativeVideoCallViewController: UIViewController {
  let boundCallId: String

  private let session: NativeVideoCallSession
  private var currentState: NativeVideoCallRuntimeState = .ringing
  private var cameraEnabled = true
  private var connectedAt: Date?
  private var durationTimer: Timer?
  private var acceptStarted = false
  private var inPipMode = false
  private var pipController: AVPictureInPictureController?
  private var pipContentViewController: AVPictureInPictureVideoCallViewController?
  private var remoteRenderView: UIView?

  private let videoRoot = UIView()
  private let remoteContainer = UIView()
  private let localContainer = UIView()
  private let overlayRoot = UIView()
  private let statusPanel = UIView()
  private let peerNameLabel = UILabel()
  private let statusLabel = UILabel()
  private let durationLabel = UILabel()
  private let avatarInitialLabel = UILabel()
  private let incomingActions = UIStackView()
  private let activeActions = UIStackView()
  private let connectedControls = UIStackView()
  private let acceptButton = UIButton(type: .system)
  private let declineButton = UIButton(type: .system)
  private let endButton = UIButton(type: .system)
  private let cameraButton = UIButton(type: .system)
  private let cameraFlipButton = UIButton(type: .system)
  private let minimizeButton = UIButton(type: .system)

  init(callId: String, session: NativeVideoCallSession) {
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
    view.backgroundColor = .black
    buildLayout()
    bindActions()
    applyState(NativeVideoCallRuntime.shared.snapshot().state)
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    configurePipIfNeeded()
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    stopDurationTimer()
  }

  func applyState(_ state: NativeVideoCallRuntimeState) {
    currentState = state
    // Use init-captured session — avoid queue.sync on main during PiP reparent/stop (P4 deadlock).
    let model = NativeVideoCallUiPresenter.build(session: session, state: state)

    peerNameLabel.text = model.peerName
    statusLabel.text = model.statusText
    avatarInitialLabel.text = model.avatarInitial
    incomingActions.isHidden = !model.showIncomingActions
    activeActions.isHidden = !model.showActiveActions
    connectedControls.isHidden = !model.showConnectedControls
    endButton.setTitle(model.endButtonLabel, for: .normal)
    cameraButton.setTitle(model.cameraLabel, for: .normal)
    videoRoot.isHidden = !model.showVideoSurfaces
    localContainer.isHidden = !model.showLocalPreview
    statusPanel.isHidden = !model.showStatusOverlay
    overlayRoot.backgroundColor = model.showVideoSurfaces ? .clear : UIColor(white: 0.08, alpha: 1)

    if model.showDuration {
      if connectedAt == nil { connectedAt = Date() }
      durationLabel.isHidden = false
      startDurationTimer()
    } else {
      stopDurationTimer()
      connectedAt = nil
      durationLabel.isHidden = true
    }

    if model.showVideoSurfaces {
      view.bringSubviewToFront(activeActions)
      _ = ensureVideoRootForRemoteRender()
      NativeVideoCallAgoraEngine.shared.onRemoteRenderSurfaceReady(callId: boundCallId)
    }

    if inPipMode {
      applyPipUiMode(true)
    }

    if state != .ringing {
      acceptStarted = false
    }

    if state == .connected {
      ScreenAwakeBridge.shared.acquire(callId: boundCallId, reason: "connected_video")
    } else if state == .ending || state == .ended || state == .failed {
      ScreenAwakeBridge.shared.release(callId: boundCallId, reason: "video_runtime_state")
    }
  }

  @discardableResult
  func ensureVideoRootForRemoteRender() -> Bool {
    videoRoot.isHidden = false
    remoteContainer.isHidden = false
    return true
  }

  func attachLocalView(_ view: UIView) {
    replaceSubview(in: localContainer, with: view, mediaOverlay: true)
  }

  func attachRemoteView(_ view: UIView) {
    ensureVideoRootForRemoteRender()
    remoteRenderView = view
    replaceSubview(in: remoteContainer, with: view, mediaOverlay: false)
  }

  func clearVideoSurfaces() {
    localContainer.subviews.forEach { $0.removeFromSuperview() }
    remoteContainer.subviews.forEach { $0.removeFromSuperview() }
    remoteRenderView = nil
  }

  var isPictureInPictureActive: Bool {
    pipController?.isPictureInPictureActive == true
  }

  // MARK: - PiP (Phase C3)

  func tryEnterPip(source: String) -> Bool {
    guard isPipEligible() else {
      NativeVideoCallLog.info(
        "native_video_pip_blocked",
        callId: boundCallId,
        details: "source=\(source) state=\(currentState)"
      )
      return false
    }
    guard let pipController else {
      NativeVideoCallLog.info("native_video_pip_blocked", callId: boundCallId, details: "source=\(source) no_controller")
      return false
    }
    if pipController.isPictureInPictureActive {
      return true
    }
    pipController.startPictureInPicture()
    NativeVideoCallLog.info("native_video_pip_enter_requested", callId: boundCallId, details: "source=\(source)")
    return true
  }

  func applyPipUiMode(_ enabled: Bool) {
    inPipMode = enabled
    overlayRoot.isHidden = enabled
    activeActions.isHidden = enabled
    localContainer.isHidden = enabled
    if !enabled {
      applyState(currentState)
    }
  }

  func stopPipIfActive() {
    guard pipController?.isPictureInPictureActive == true else { return }
    reparentRemoteViewToFullscreen()
    applyPipUiMode(false)
    pipController?.stopPictureInPicture()
  }

  private func reparentRemoteView(to container: UIView) {
    if let remoteView = remoteRenderView {
      guard remoteView.superview !== container else { return }
      remoteView.removeFromSuperview()
      remoteView.translatesAutoresizingMaskIntoConstraints = false
      container.addSubview(remoteView)
      NSLayoutConstraint.activate([
        remoteView.topAnchor.constraint(equalTo: container.topAnchor),
        remoteView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
        remoteView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        remoteView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
      ])
      return
    }
    NativeVideoCallAgoraEngine.shared.reattachRemoteVideo(callId: boundCallId)
  }

  private func reparentRemoteViewToPip() {
    guard let pipVC = pipContentViewController else { return }
    _ = ensureVideoRootForRemoteRender()
    reparentRemoteView(to: pipVC.view)
    NativeVideoCallLog.info("native_video_pip_remote_reparented", callId: boundCallId, details: "target=pip")
  }

  private func reparentRemoteViewToFullscreen() {
    _ = ensureVideoRootForRemoteRender()
    if let remoteView = remoteRenderView, remoteView.superview === remoteContainer {
      return
    }
    reparentRemoteView(to: remoteContainer)
    if remoteRenderView == nil {
      NativeVideoCallAgoraEngine.shared.reattachRemoteVideo(callId: boundCallId)
    }
    NativeVideoCallLog.info("native_video_pip_remote_reparented", callId: boundCallId, details: "target=fullscreen")
  }

  private func isPipEligible() -> Bool {
    currentState == .connected
  }

  private func configurePipIfNeeded() {
    guard #available(iOS 15.0, *) else { return }
    guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
    guard pipController == nil else { return }

    let pipVC = AVPictureInPictureVideoCallViewController()
    pipVC.preferredContentSize = CGSize(width: 9, height: 16)
    pipContentViewController = pipVC
    let contentSource = AVPictureInPictureController.ContentSource(
      activeVideoCallSourceView: remoteContainer,
      contentViewController: pipVC
    )
    let controller = AVPictureInPictureController(contentSource: contentSource)
    controller.canStartPictureInPictureAutomaticallyFromInline = false
    controller.delegate = self
    pipController = controller
  }

  // MARK: - Layout

  private func buildLayout() {
    [videoRoot, overlayRoot].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview($0)
    }
    NSLayoutConstraint.activate([
      videoRoot.topAnchor.constraint(equalTo: view.topAnchor),
      videoRoot.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      videoRoot.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      videoRoot.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      overlayRoot.topAnchor.constraint(equalTo: view.topAnchor),
      overlayRoot.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      overlayRoot.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      overlayRoot.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    [remoteContainer, localContainer].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      $0.backgroundColor = .black
      videoRoot.addSubview($0)
    }
    NSLayoutConstraint.activate([
      remoteContainer.topAnchor.constraint(equalTo: videoRoot.topAnchor),
      remoteContainer.leadingAnchor.constraint(equalTo: videoRoot.leadingAnchor),
      remoteContainer.trailingAnchor.constraint(equalTo: videoRoot.trailingAnchor),
      remoteContainer.bottomAnchor.constraint(equalTo: videoRoot.bottomAnchor),
      localContainer.widthAnchor.constraint(equalToConstant: 120),
      localContainer.heightAnchor.constraint(equalToConstant: 213),
      localContainer.topAnchor.constraint(equalTo: videoRoot.safeAreaLayoutGuide.topAnchor, constant: 16),
      localContainer.trailingAnchor.constraint(equalTo: videoRoot.trailingAnchor, constant: -16),
    ])
    localContainer.layer.cornerRadius = 8
    localContainer.clipsToBounds = true

    statusPanel.translatesAutoresizingMaskIntoConstraints = false
    overlayRoot.addSubview(statusPanel)
    NSLayoutConstraint.activate([
      statusPanel.centerXAnchor.constraint(equalTo: overlayRoot.centerXAnchor),
      statusPanel.centerYAnchor.constraint(equalTo: overlayRoot.centerYAnchor, constant: -40),
      statusPanel.leadingAnchor.constraint(greaterThanOrEqualTo: overlayRoot.leadingAnchor, constant: 24),
      statusPanel.trailingAnchor.constraint(lessThanOrEqualTo: overlayRoot.trailingAnchor, constant: -24),
    ])

    avatarInitialLabel.font = .systemFont(ofSize: 48, weight: .semibold)
    avatarInitialLabel.textColor = .white
    avatarInitialLabel.textAlignment = .center
    avatarInitialLabel.backgroundColor = UIColor(white: 0.25, alpha: 1)
    avatarInitialLabel.layer.cornerRadius = 48
    avatarInitialLabel.clipsToBounds = true
    avatarInitialLabel.translatesAutoresizingMaskIntoConstraints = false
    statusPanel.addSubview(avatarInitialLabel)
    NSLayoutConstraint.activate([
      avatarInitialLabel.widthAnchor.constraint(equalToConstant: 96),
      avatarInitialLabel.heightAnchor.constraint(equalToConstant: 96),
      avatarInitialLabel.topAnchor.constraint(equalTo: statusPanel.topAnchor),
      avatarInitialLabel.centerXAnchor.constraint(equalTo: statusPanel.centerXAnchor),
    ])

    peerNameLabel.font = .systemFont(ofSize: 22, weight: .semibold)
    peerNameLabel.textColor = .white
    peerNameLabel.textAlignment = .center
    statusLabel.font = .systemFont(ofSize: 15)
    statusLabel.textColor = .lightGray
    statusLabel.textAlignment = .center
    durationLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .regular)
    durationLabel.textColor = .lightGray
    durationLabel.textAlignment = .center

    let nameStack = UIStackView(arrangedSubviews: [peerNameLabel, statusLabel, durationLabel])
    nameStack.axis = .vertical
    nameStack.spacing = 8
    nameStack.translatesAutoresizingMaskIntoConstraints = false
    statusPanel.addSubview(nameStack)
    NSLayoutConstraint.activate([
      nameStack.topAnchor.constraint(equalTo: avatarInitialLabel.bottomAnchor, constant: 16),
      nameStack.leadingAnchor.constraint(equalTo: statusPanel.leadingAnchor),
      nameStack.trailingAnchor.constraint(equalTo: statusPanel.trailingAnchor),
      nameStack.bottomAnchor.constraint(equalTo: statusPanel.bottomAnchor),
    ])

    configureActionButton(acceptButton, title: "수락", color: .systemGreen)
    configureActionButton(declineButton, title: "거절", color: .systemRed)
    configureActionButton(endButton, title: "종료", color: .systemRed)
    configureActionButton(cameraButton, title: "카메라 켬", color: .white)
    configureActionButton(cameraFlipButton, title: "전환", color: .white)
    configureActionButton(minimizeButton, title: "축소", color: .white)

    incomingActions.axis = .horizontal
    incomingActions.spacing = 24
    incomingActions.distribution = .fillEqually
    incomingActions.addArrangedSubview(declineButton)
    incomingActions.addArrangedSubview(acceptButton)

    connectedControls.axis = .horizontal
    connectedControls.spacing = 12
    connectedControls.addArrangedSubview(cameraButton)
    connectedControls.addArrangedSubview(cameraFlipButton)
    connectedControls.addArrangedSubview(minimizeButton)

    activeActions.axis = .vertical
    activeActions.spacing = 16
    activeActions.addArrangedSubview(connectedControls)
    activeActions.addArrangedSubview(endButton)

    [incomingActions, activeActions].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      overlayRoot.addSubview($0)
      NSLayoutConstraint.activate([
        $0.leadingAnchor.constraint(equalTo: overlayRoot.leadingAnchor, constant: 24),
        $0.trailingAnchor.constraint(equalTo: overlayRoot.trailingAnchor, constant: -24),
        $0.bottomAnchor.constraint(equalTo: overlayRoot.safeAreaLayoutGuide.bottomAnchor, constant: -32),
      ])
    }
    videoRoot.isHidden = true
    localContainer.isHidden = true
  }

  private func configureActionButton(_ button: UIButton, title: String, color: UIColor) {
    button.setTitle(title, for: .normal)
    button.setTitleColor(color, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    button.backgroundColor = UIColor(white: 0.15, alpha: 0.85)
    button.layer.cornerRadius = 8
    button.contentEdgeInsets = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
  }

  private func bindActions() {
    acceptButton.addTarget(self, action: #selector(onAcceptTapped), for: .touchUpInside)
    declineButton.addTarget(self, action: #selector(onDeclineTapped), for: .touchUpInside)
    endButton.addTarget(self, action: #selector(onEndTapped), for: .touchUpInside)
    cameraButton.addTarget(self, action: #selector(onCameraTapped), for: .touchUpInside)
    cameraFlipButton.addTarget(self, action: #selector(onCameraFlipTapped), for: .touchUpInside)
    minimizeButton.addTarget(self, action: #selector(onMinimizeTapped), for: .touchUpInside)
  }

  @objc private func onAcceptTapped() {
    performAccept(source: "button")
  }

  @objc private func onDeclineTapped() {
    NativeVideoCallKitBridge.requestEnd(callId: boundCallId, kind: "decline")
  }

  @objc private func onEndTapped() {
    NativeVideoCallLog.info("native_video_call_end", callId: boundCallId)
    if isPictureInPictureActive {
      DibayCallPipPlugin.publishPipAction(action: "end", callId: boundCallId)
    }
    NativeVideoIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: boundCallId) {}
  }

  @objc private func onCameraTapped() {
    cameraEnabled.toggle()
    cameraButton.setTitle(NativeVideoCallUiPresenter.cameraLabel(enabled: cameraEnabled), for: .normal)
    NativeVideoCallAgoraEngine.shared.setCameraEnabled(cameraEnabled)
  }

  @objc private func onCameraFlipTapped() {
    NativeVideoCallAgoraEngine.shared.switchCameraFacing()
  }

  @objc private func onMinimizeTapped() {
    _ = tryEnterPip(source: "button")
  }

  private func performAccept(source: String) {
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard snap.session?.sessionId == boundCallId, snap.state == .ringing else {
      NativeVideoCallLog.info(
        "accept_duplicate_blocked",
        callId: boundCallId,
        details: "source=\(source) state=\(snap.state)"
      )
      return
    }
    if acceptStarted {
      NativeVideoCallLog.info("accept_duplicate_blocked", callId: boundCallId, details: "source=\(source) reason=in_flight")
      return
    }
    acceptStarted = true
    let context = DibayVoiceMicrophonePermission.resolveIncomingAnswerContext()
    DibayVideoMediaPermission.ensureGranted(sessionId: boundCallId, context: context) { [weak self] granted in
      guard let self else { return }
      guard granted else {
        self.acceptStarted = false
        NativeVideoCallLog.info("video_accept_fail_permission", callId: self.boundCallId, details: "source=\(source)")
        NativeVideoCallKitBridge.requestEnd(callId: self.boundCallId, kind: "decline")
        return
      }
      NativeVideoCallKitBridge.requestAnswer(callId: self.boundCallId, source: source)
    }
  }

  private func replaceSubview(in container: UIView, with child: UIView, mediaOverlay: Bool) {
    container.subviews.forEach { $0.removeFromSuperview() }
    child.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(child)
    NSLayoutConstraint.activate([
      child.topAnchor.constraint(equalTo: container.topAnchor),
      child.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      child.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      child.bottomAnchor.constraint(equalTo: container.bottomAnchor),
    ])
    if mediaOverlay {
      child.layer.zPosition = 1
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
      durationLabel.text = nil
      return
    }
    let elapsed = max(0, Int(Date().timeIntervalSince(connectedAt)))
    let minutes = elapsed / 60
    let seconds = elapsed % 60
    durationLabel.text = String(format: "%02d:%02d", minutes, seconds)
  }
}

@available(iOS 15.0, *)
extension NativeVideoCallViewController: AVPictureInPictureControllerDelegate {
  func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    reparentRemoteViewToPip()
    applyPipUiMode(true)
    ScreenAwakeBridge.shared.notifyPresentationChanged(callId: boundCallId, presentation: "pip")
    DibayCallPipPlugin.publishPipModeChanged(inPipMode: true, callId: boundCallId)
    NativeVideoCallLog.info("native_video_pip_entered", callId: boundCallId)
  }

  func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    reparentRemoteViewToFullscreen()
    applyPipUiMode(false)
    ScreenAwakeBridge.shared.notifyPresentationChanged(callId: boundCallId, presentation: "fullscreen")
    DibayCallPipPlugin.publishPipModeChanged(inPipMode: false, callId: boundCallId)
    NativeVideoCallLog.info("native_video_pip_exited", callId: boundCallId)
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
  ) {
    reparentRemoteViewToFullscreen()
    applyPipUiMode(false)
    DibayCallPipPlugin.publishPipAction(action: "restore", callId: boundCallId)
    NativeVideoCallLog.info("native_video_pip_restore", callId: boundCallId)
    completionHandler(true)
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error
  ) {
    NativeVideoCallLog.warn(
      "native_video_pip_enter_failed",
      callId: boundCallId,
      details: "err=\(error.localizedDescription)"
    )
  }
}

/** Routes Native accept/decline through CallKit so CXAnswer/CXEnd fulfill existing CallKitProvider paths. */
enum NativeVideoCallKitBridge {
  private static let callController = CXCallController()

  static func requestAnswer(callId: String, source: String) {
    guard let uuid = resolveCallUUID(callId: callId) else {
      NativeVideoCallLog.info(
        "callkit_action_failed",
        callId: callId,
        details: "kind=answer source=\(source) reason=missing_uuid"
      )
      return
    }
    let action = CXAnswerCallAction(call: uuid)
    let transaction = CXTransaction(action: action)
    callController.request(transaction) { error in
      if let error {
        NativeVideoCallLog.info(
          "callkit_action_failed",
          callId: callId,
          details: "kind=answer source=\(source) err=\(error.localizedDescription)"
        )
      } else {
        NativeVideoCallLog.info(
          "callkit_action_requested",
          callId: callId,
          details: "kind=answer source=\(source)"
        )
      }
    }
  }

  static func requestEnd(callId: String, kind: String) {
    guard let uuid = resolveCallUUID(callId: callId) else {
      NativeVideoCallLog.info(
        "callkit_action_failed",
        callId: callId,
        details: "kind=\(kind) reason=missing_uuid"
      )
      return
    }
    let action = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: action)
    callController.request(transaction) { error in
      if let error {
        NativeVideoCallLog.info(
          "callkit_action_failed",
          callId: callId,
          details: "kind=\(kind) err=\(error.localizedDescription)"
        )
      } else {
        NativeVideoCallLog.info(
          "callkit_action_requested",
          callId: callId,
          details: "kind=\(kind)"
        )
      }
    }
  }

  private static func resolveCallUUID(callId: String) -> UUID? {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return nil }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard let session = snap.session, session.sessionId == sid else { return nil }
    return session.callUUID
  }
}
