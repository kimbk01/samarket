import AVFoundation
import AVKit
import AgoraRtcKit
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

  // R1 — 보조 PiP 드래그 (Android attachLocalPipDragListener 패리티)
  private static let localPipWidth: CGFloat = 120
  private static let localPipHeight: CGFloat = 213
  private static let localPipMargin: CGFloat = 16
  private var localPipLeadingConstraint: NSLayoutConstraint?
  private var localPipTopConstraint: NSLayoutConstraint?
  private var localPipLeading: CGFloat = 0
  private var localPipTop: CGFloat = 16
  private var localPipCustomPosition = false
  private var localPipDragStartLeading: CGFloat = 0
  private var localPipDragStartTop: CGFloat = 0

  // R2 — 나↔상대 스왑 (보조 PiP 더블탭)
  private var localRenderView: UIView?
  private var localIsMain = false

  // 시스템 PiP 프레임 브리지(B안: autostart 유지 + 백그라운드 직전 워밍업). 기존 렌더와 독립.
  private var pipFrameBridge: NativeVideoCallPipFrameBridge?

  private let videoRoot = UIView()
  private let remoteContainer = UIView()
  private let localContainer = UIView()
  private let overlayRoot = PassthroughOverlayView()
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
    // B안: autostart PiP가 백그라운드에서 PiP를 띄우기 직전에 프레임 브리지를 워밍업(willStart 아님).
    NotificationCenter.default.addObserver(
      self, selector: #selector(onAppWillResignActive),
      name: UIApplication.willResignActiveNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(onAppDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification, object: nil)
    applyState(NativeVideoCallRuntime.shared.snapshot().state)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    teardownPipFrameBridge(reason: "deinit")
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    configurePipIfNeeded()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard videoRoot.bounds.width > 0 else { return }
    // 회전/레이아웃 변경: 기본 위치는 재계산, 사용자가 옮긴 위치는 새 bounds로 재clamp (QA A2)
    if localPipCustomPosition {
      let clamped = clampLocalPipPosition(leading: localPipLeading, top: localPipTop)
      applyLocalPipPosition(leading: clamped.leading, top: clamped.top)
    } else {
      applyDefaultLocalPipPosition()
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    stopDurationTimer()
    // PiP 활성 중이면 프레임 유지(백그라운드 시 view가 사라져도 브리지는 살아있어야 함). 통화 종료는 clearVideoSurfaces가 처리.
    if !inPipMode { teardownPipFrameBridge(reason: "view_did_disappear") }
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

    // B1 — connected 동안에만 자동 시스템 PiP 활성(빈 화면 PiP 방지).
    pipController?.canStartPictureInPictureAutomaticallyFromInline = (state == .connected)
  }

  @discardableResult
  func ensureVideoRootForRemoteRender() -> Bool {
    videoRoot.isHidden = false
    remoteContainer.isHidden = false
    return true
  }

  func attachLocalView(_ view: UIView) {
    localRenderView = view
    replaceSubview(in: localContainer, with: view, mediaOverlay: true)
    if localIsMain { applyVideoSwap() }
  }

  func attachRemoteView(_ view: UIView) {
    ensureVideoRootForRemoteRender()
    remoteRenderView = view
    replaceSubview(in: remoteContainer, with: view, mediaOverlay: false)
    if localIsMain { applyVideoSwap() }
  }

  func clearVideoSurfaces() {
    teardownPipFrameBridge(reason: "clear_video_surfaces")
    localContainer.subviews.forEach { $0.removeFromSuperview() }
    remoteContainer.subviews.forEach { $0.removeFromSuperview() }
    remoteRenderView = nil
    localRenderView = nil
    localIsMain = false
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
    // B1 — 카톡·텔레그램식: connected 동안 앱을 나가면 시스템 PiP 자동 진입(타앱 위 플로팅).
    controller.canStartPictureInPictureAutomaticallyFromInline = (currentState == .connected)
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
      localContainer.widthAnchor.constraint(equalToConstant: Self.localPipWidth),
      localContainer.heightAnchor.constraint(equalToConstant: Self.localPipHeight),
    ])
    // 고정 top/trailing → 가변 leading/top (드래그 이동용). 기본 위치는 viewDidLayoutSubviews에서 우상단으로 설정.
    let localTop = localContainer.topAnchor.constraint(
      equalTo: videoRoot.safeAreaLayoutGuide.topAnchor,
      constant: localPipTop
    )
    let localLeading = localContainer.leadingAnchor.constraint(
      equalTo: videoRoot.leadingAnchor,
      constant: localPipLeading
    )
    localPipTopConstraint = localTop
    localPipLeadingConstraint = localLeading
    NSLayoutConstraint.activate([localTop, localLeading])
    attachLocalPipDragGesture()
    attachLocalPipDoubleTapGesture()
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

  // MARK: - R1 보조 PiP 드래그 (Android attachLocalPipDragListener 패리티)

  private func attachLocalPipDragGesture() {
    localContainer.isUserInteractionEnabled = true
    let pan = UIPanGestureRecognizer(target: self, action: #selector(onLocalPipPanned(_:)))
    localContainer.addGestureRecognizer(pan)
  }

  /** 드래그 허용: connected 통화 중 + 시스템 PiP 미진입 시에만. */
  private func isLocalPipDragEligible() -> Bool {
    currentState == .connected && !inPipMode
  }

  @objc private func onLocalPipPanned(_ gesture: UIPanGestureRecognizer) {
    guard isLocalPipDragEligible() else { return }
    switch gesture.state {
    case .began:
      localPipCustomPosition = true
      localPipDragStartLeading = localPipLeading
      localPipDragStartTop = localPipTop
    case .changed:
      let t = gesture.translation(in: videoRoot)
      let clamped = clampLocalPipPosition(
        leading: localPipDragStartLeading + t.x,
        top: localPipDragStartTop + t.y
      )
      applyLocalPipPosition(leading: clamped.leading, top: clamped.top)
    case .ended, .cancelled:
      NativeVideoCallLog.info(
        "native_video_local_pip_drag",
        callId: boundCallId,
        details: "left=\(Int(localPipLeading)) top=\(Int(localPipTop))"
      )
    default:
      break
    }
  }

  /** 기본 위치: 우상단(안전영역 기준 margin). */
  private func applyDefaultLocalPipPosition() {
    guard videoRoot.bounds.width > 0 else { return }
    let clamped = clampLocalPipPosition(leading: .greatestFiniteMagnitude, top: Self.localPipMargin)
    applyLocalPipPosition(leading: clamped.leading, top: clamped.top)
  }

  /** leading은 videoRoot 전체폭 기준, top은 safeArea top 기준 좌표. 안전영역 안으로 clamp. */
  private func clampLocalPipPosition(leading: CGFloat, top: CGFloat) -> (leading: CGFloat, top: CGFloat) {
    let bounds = videoRoot.bounds
    let insets = videoRoot.safeAreaInsets
    let minLeading = insets.left + Self.localPipMargin
    let maxLeading = max(minLeading, bounds.width - insets.right - Self.localPipWidth - Self.localPipMargin)
    let minTop = Self.localPipMargin
    let maxTop = max(minTop, bounds.height - insets.top - insets.bottom - Self.localPipHeight - Self.localPipMargin)
    return (
      max(minLeading, min(leading, maxLeading)),
      max(minTop, min(top, maxTop))
    )
  }

  private func applyLocalPipPosition(leading: CGFloat, top: CGFloat) {
    localPipLeading = leading
    localPipTop = top
    localPipLeadingConstraint?.constant = leading
    localPipTopConstraint?.constant = top
  }

  // MARK: - R2 나↔상대 스왑 (보조 PiP 더블탭)

  private func attachLocalPipDoubleTapGesture() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(onLocalPipDoubleTapped))
    tap.numberOfTapsRequired = 2
    localContainer.addGestureRecognizer(tap)
  }

  @objc private func onLocalPipDoubleTapped() {
    guard currentState == .connected, !inPipMode else { return }
    localIsMain.toggle()
    applyVideoSwap()
    NativeVideoCallLog.info("native_video_local_pip_swap", callId: boundCallId, details: "localMain=\(localIsMain)")
  }

  /** 컨테이너 지오메트리(풀스크린 remoteContainer / 작은 localContainer)는 고정, 두 영상 뷰만 교환. Agora 재바인딩 없음. */
  private func applyVideoSwap() {
    guard let remoteView = remoteRenderView, let localView = localRenderView else { return }
    let mainView = localIsMain ? localView : remoteView   // 풀스크린(remoteContainer)
    let auxView = localIsMain ? remoteView : localView     // 작은 박스(localContainer)
    replaceSubview(in: remoteContainer, with: mainView, mediaOverlay: false)
    replaceSubview(in: localContainer, with: auxView, mediaOverlay: true)
  }

  /** 시스템 PiP 진입 전 스왑을 기본(remote 메인)으로 되돌려 reparent 충돌 방지. */
  private func resetVideoSwapForPip() {
    guard localIsMain else { return }
    localIsMain = false
    applyVideoSwap()
  }

  // MARK: - 시스템 PiP 프레임 브리지 (B안: autostart 유지, 백그라운드 직전 워밍업)

  @objc private func onAppWillResignActive() {
    // PiP 시작(willStart) 이전에 프레임 공급을 미리 준비. 등록은 여기서 최초로 이뤄진다(willStart 아님).
    preparePipFrameBridgeIfNeeded(reason: "will_resign_active")
  }

  @objc private func onAppDidBecomeActive() {
    // 포그라운드 복귀 & PiP 미진입이면(워밍업만 하고 PiP가 안 뜬 경우) 즉시 정리.
    if !inPipMode { teardownPipFrameBridge(reason: "did_become_active_no_pip") }
  }

  /// 연결된 영상통화 + Voice 미점유 시에만 프레임 델리게이트 등록 + sample 뷰 부착. 실패 시 no-op(fail-safe).
  private func preparePipFrameBridgeIfNeeded(reason: String) {
    guard currentState == .connected else { return }
    guard pipContentViewController != nil else { return }
    guard pipFrameBridge == nil else { return } // 중복 등록 방지
    guard let uid = NativeVideoCallAgoraEngine.shared.currentRemoteUid(callId: boundCallId), uid != 0 else { return }
    let bridge = NativeVideoCallPipFrameBridge(remoteUid: uid)
    guard NativeVideoCallAgoraEngine.shared.startPipFrameTap(bridge) else {
      NativeVideoCallLog.info("native_video_pip_frame_tap_skipped", callId: boundCallId, details: "reason=\(reason) voice_or_no_engine")
      return
    }
    bridge.activate()
    pipFrameBridge = bridge
    attachPipFrameHostIfNeeded()
    NativeVideoCallLog.info("native_video_pip_frame_tap_started", callId: boundCallId, details: "reason=\(reason) uid=\(uid)")
  }

  /// sample-buffer 호스트 뷰를 pipVC.view에 채워 부착(보조 레이어). 기존 reparent된 Agora UIView 위에 얹힌다.
  private func attachPipFrameHostIfNeeded() {
    guard let bridge = pipFrameBridge, let pipVC = pipContentViewController else { return }
    let host = bridge.hostView
    if host.superview === pipVC.view {
      pipVC.view.bringSubviewToFront(host)
      return
    }
    host.translatesAutoresizingMaskIntoConstraints = false
    pipVC.view.addSubview(host)
    pipVC.view.bringSubviewToFront(host)
    NSLayoutConstraint.activate([
      host.topAnchor.constraint(equalTo: pipVC.view.topAnchor),
      host.leadingAnchor.constraint(equalTo: pipVC.view.leadingAnchor),
      host.trailingAnchor.constraint(equalTo: pipVC.view.trailingAnchor),
      host.bottomAnchor.constraint(equalTo: pipVC.view.bottomAnchor),
    ])
  }

  /// 프레임 델리게이트 해제 + sample 뷰 제거. 모든 해제 경로에서 idempotent 호출.
  private func teardownPipFrameBridge(reason: String) {
    guard let bridge = pipFrameBridge else { return }
    pipFrameBridge = nil
    NativeVideoCallAgoraEngine.shared.stopPipFrameTap()
    bridge.deactivate()
    bridge.hostView.removeFromSuperview()
    NativeVideoCallLog.info("native_video_pip_frame_tap_stopped", callId: boundCallId, details: "reason=\(reason)")
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
    resetVideoSwapForPip()
    reparentRemoteViewToPip()
    // 조건 준수: willStart에서 최초 등록하지 않음 — willResignActive 워밍업으로 이미 준비된 브리지의 sample 뷰만 부착(부재 시 no-op).
    attachPipFrameHostIfNeeded()
    applyPipUiMode(true)
    ScreenAwakeBridge.shared.notifyPresentationChanged(callId: boundCallId, presentation: "pip")
    DibayCallPipPlugin.publishPipModeChanged(inPipMode: true, callId: boundCallId)
    NativeVideoCallLog.info("native_video_pip_entered", callId: boundCallId)
  }

  func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    teardownPipFrameBridge(reason: "pip_did_stop")
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
    teardownPipFrameBridge(reason: "pip_restore")
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
    teardownPipFrameBridge(reason: "pip_enter_failed")
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

/// 오버레이 컨테이너: 빈 영역 터치는 아래(videoRoot·보조 PiP)로 통과시키고,
/// 실제 버튼/서브뷰만 터치를 받는다. (투명 UIView가 보조 PiP 드래그를 가로채는 문제 해결)
final class PassthroughOverlayView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

/// 시스템 PiP 전용 원격 영상 프레임 브리지 (ContentSource B 방식의 **보조 레이어**).
///
/// 격리 원칙:
/// - 기존 Agora `setupRemoteVideo` UIView 렌더 경로와 완전 독립. 이 클래스는 별도 `AVSampleBufferDisplayLayer`에만 그린다.
/// - 프레임 델리게이트는 `.readOnly` 모드 → 기존 렌더 파이프라인 프레임을 수정하지 않는다.
/// - `deactivate()` 이후 도착하는 프레임은 `isActive` 가드로 폐기(종료 후 콜백 잔존 방지).
/// - 실패·미지원이어도 통화 화면은 무영향(호출측 fail-safe).
final class NativeVideoCallPipFrameBridge: NSObject {

  /// 백킹 레이어가 AVSampleBufferDisplayLayer인 호스트 뷰. Auto Layout으로 pipVC.view에 채우면 자동 리사이즈.
  final class SampleBufferHostView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
    var displayLayer: AVSampleBufferDisplayLayer { layer as! AVSampleBufferDisplayLayer }
  }

  let hostView = SampleBufferHostView()

  private let targetUid: UInt
  private let stateLock = NSLock()
  private var _isActive = false
  private var isActive: Bool {
    get { stateLock.lock(); defer { stateLock.unlock() }; return _isActive }
    set { stateLock.lock(); _isActive = newValue; stateLock.unlock() }
  }

  init(remoteUid: UInt) {
    self.targetUid = remoteUid
    super.init()
    hostView.backgroundColor = .black
    hostView.displayLayer.videoGravity = .resizeAspect
  }

  func activate() { isActive = true }

  func deactivate() {
    isActive = false
    let layer = hostView.displayLayer
    DispatchQueue.main.async { layer.flushAndRemoveImage() }
  }

  private static func makeSampleBuffer(from pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
    var formatDesc: CMVideoFormatDescription?
    guard CMVideoFormatDescriptionCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescriptionOut: &formatDesc) == noErr, let fmt = formatDesc else { return nil }
    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
      decodeTimeStamp: .invalid)
    var sampleBuffer: CMSampleBuffer?
    guard CMSampleBufferCreateReadyWithImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescription: fmt,
      sampleTiming: &timing,
      sampleBufferOut: &sampleBuffer) == noErr, let sb = sampleBuffer else { return nil }
    if let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true),
       CFArrayGetCount(attachments) > 0 {
      let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        dict,
        Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }
    return sb
  }
}

extension NativeVideoCallPipFrameBridge: AgoraVideoFrameDelegate {
  func onRenderVideoFrame(_ videoFrame: AgoraOutputVideoFrame, uid: UInt, channelId: String) -> Bool {
    guard isActive, uid == targetUid, let pixelBuffer = videoFrame.pixelBuffer else { return true }
    guard let sampleBuffer = Self.makeSampleBuffer(from: pixelBuffer) else { return true }
    let layer = hostView.displayLayer
    DispatchQueue.main.async { [weak self] in
      guard let self, self.isActive else { return }
      if layer.status == .failed { layer.flush() }
      layer.enqueue(sampleBuffer)
    }
    return true
  }

  // 읽기 전용: 기존 렌더 프레임을 변형하지 않는다.
  func getVideoFrameProcessMode() -> AgoraVideoFrameProcessMode { .readOnly }
  func getVideoFormatPreference() -> AgoraVideoFormat { .cvPixelBGRA }
  func getRotationApplied() -> Bool { true }
  func getMirrorApplied() -> Bool { false }
}
