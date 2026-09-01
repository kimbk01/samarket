import AVFoundation
import AVKit
import AgoraRtcKit
import CallKit
import UIKit

/** Native-only video call UI. Never hosts WebView. Render-only over NativeVideoCallRuntime state. */
final class NativeVideoCallViewController: UIViewController, UIGestureRecognizerDelegate {
  let boundCallId: String

  private let session: NativeVideoCallSession
  private var currentState: NativeVideoCallRuntimeState = .ringing
  private var cameraEnabled = true
  private var micMuted = false
  private var isChromeVisible = false
  private var chromeHideWorkItem: DispatchWorkItem?
  private var connectedAt: Date?
  private var durationTimer: Timer?
  private var acceptStarted = false
  private var inPipMode = false
  private var pipController: AVPictureInPictureController?
  private var pipContentViewController: AVPictureInPictureVideoCallViewController?
  private var remoteRenderView: UIView?
  private var outgoingLocalFirstFrameReadyFlag = false
  private var outgoingRemoteFirstFrameReadyFlag = false
  private var outgoingTransitionRunning = false
  private var outgoingTransitionCompleted = false
  private var outgoingTransitionGeneration = 0
  private var outgoingTransitionAnimator: UIViewPropertyAnimator?
  private var lockedOutgoingPipTarget: ResolvedPipFrame?
  private var pipLayoutPassCount = 0
  private var suppressOutgoingTransitionRestart = false

  private struct ResolvedPipFrame: Equatable {
    let leading: CGFloat
    let top: CGFloat
    let width: CGFloat
    let height: CGFloat
  }

  // R1 — 보조 PiP 드래그 (Android attachLocalPipDragListener 패리티)
  private static let localPipWidth: CGFloat = 120
  private static let localPipHeight: CGFloat = 213
  private static let localPipMargin: CGFloat = 16
  private var localPipLeadingConstraint: NSLayoutConstraint?
  private var localPipTopConstraint: NSLayoutConstraint?
  private var localPipWidthConstraint: NSLayoutConstraint?
  private var localPipHeightConstraint: NSLayoutConstraint?
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
  private let micButton = UIButton(type: .system)

  private enum NetworkDisplayTier {
    case good, fair, poor, veryPoor
  }

  private let connectedChromeContainer = UIView()
  private let connectedPeerNameLabel = UILabel()
  private let connectedDurationLabel = UILabel()
  private let connectedSignalLabel = UILabel()
  private var connectedSignalBars: [UIView] = []
  private var displayedNetworkTier: NetworkDisplayTier = .good
  private var networkRecoveryStableCount = 0
  private var networkVeryPoorActive = false

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
    NativeVideoCallAgoraEngine.shared.setNetworkQualityHandler { [weak self] worst, _, _ in
      self?.handleNetworkQualitySample(worst: worst)
    }
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
    cancelConnectedChromeHide(reason: "deinit")
    NativeVideoCallAgoraEngine.shared.setNetworkQualityHandler(nil)
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
    if isOutgoingVideoPresentation, !outgoingTransitionCompleted, !outgoingTransitionRunning {
      applyOutgoingLocalFullscreenLayout()
      return
    }
    if shouldSkipConnectedPipLayout() { return }
    // 회전/레이아웃 변경: 기본 위치는 재계산, 사용자가 옮긴 위치는 새 bounds로 재clamp (QA A2)
    if localPipCustomPosition {
      let clamped = clampLocalPipPosition(leading: localPipLeading, top: localPipTop)
      applyLocalPipPosition(leading: clamped.leading, top: clamped.top)
    } else {
      applyConnectedLocalPipLayout(reason: "view_did_layout", layoutNow: false)
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    cancelConnectedChromeHide(reason: "view_did_disappear")
    stopDurationTimer()
    // PiP 활성 중이면 프레임 유지(백그라운드 시 view가 사라져도 브리지는 살아있어야 함). 통화 종료는 clearVideoSurfaces가 처리.
    if !inPipMode { teardownPipFrameBridge(reason: "view_did_disappear") }
  }

  func applyState(_ state: NativeVideoCallRuntimeState) {
    let previousState = currentState
    currentState = state
    // Use init-captured session — avoid queue.sync on main during PiP reparent/stop (P4 deadlock).
    let model = NativeVideoCallUiPresenter.build(session: session, state: state)

    peerNameLabel.text = model.peerName
    statusLabel.text = model.statusText
    avatarInitialLabel.text = model.avatarInitial
    incomingActions.isHidden = !model.showIncomingActions
    if !model.showConnectedControls && !isOutgoingVideoPresentation {
      activeActions.isHidden = true
      connectedControls.isHidden = true
    } else if isOutgoingVideoPresentation, !state.isTerminal {
      activeActions.isHidden = false
      connectedControls.isHidden = false
      updateConnectedControlChrome()
    }
    if isOutgoingVideoPresentation, !state.isTerminal {
      applyOutgoingVideoPresentation(model: model, state: state)
    } else {
      videoRoot.isHidden = !model.showVideoSurfaces
      localContainer.isHidden = !model.showLocalPreview
      statusPanel.isHidden = !model.showStatusOverlay
      overlayRoot.backgroundColor = model.showVideoSurfaces ? .clear : UIColor(white: 0.08, alpha: 1)
    }

    if model.showDuration {
      if connectedAt == nil { connectedAt = Date() }
      durationLabel.isHidden = false
      startDurationTimer()
    } else {
      stopDurationTimer()
      connectedAt = nil
      durationLabel.isHidden = true
    }
    if isOutgoingVideoPresentation, !outgoingTransitionCompleted {
      durationLabel.isHidden = true
    }

    if model.showVideoSurfaces || isOutgoingVideoPresentation {
      view.bringSubviewToFront(connectedChromeContainer)
      view.bringSubviewToFront(overlayRoot)
      _ = ensureVideoRootForRemoteRender()
      NativeVideoCallAgoraEngine.shared.onRemoteRenderSurfaceReady(callId: boundCallId)
    }
    updateConnectedInfoPanel(model)

    if inPipMode {
      applyPipUiMode(true)
    }

    if state != .ringing {
      acceptStarted = false
    }

    if state == .connected {
      ScreenAwakeBridge.shared.acquire(callId: boundCallId, reason: "connected_video")
    } else if state == .ending || state == .ended || state == .failed {
      cancelOutgoingTransition(reason: "terminal_state")
      cancelConnectedChromeHide(reason: "terminal_state")
      displayedNetworkTier = .good
      networkVeryPoorActive = false
      networkRecoveryStableCount = 0
      ScreenAwakeBridge.shared.release(callId: boundCallId, reason: "video_runtime_state")
    }

    // B1 — connected 동안에만 자동 시스템 PiP 활성(빈 화면 PiP 방지).
    pipController?.canStartPictureInPictureAutomaticallyFromInline = (state == .connected)

    if model.showConnectedControls && (!isOutgoingVideoPresentation || outgoingTransitionCompleted) {
      updateConnectedControlChrome()
      if previousState != .connected {
        showConnectedChrome(source: "connected_enter")
      }
    } else {
      cancelConnectedChromeHide(reason: "state_not_connected")
      isChromeVisible = false
    }
  }

  @discardableResult
  func ensureVideoRootForRemoteRender() -> Bool {
    videoRoot.isHidden = false
    if isOutgoingVideoPresentation, !outgoingRemoteFirstFrameReadyFlag {
      remoteContainer.isHidden = true
      remoteContainer.alpha = 0
    } else {
      remoteContainer.isHidden = false
      remoteContainer.alpha = 1
    }
    return true
  }

  func attachLocalView(_ view: UIView) {
    localRenderView = view
    replaceSubview(in: localContainer, with: view, mediaOverlay: true)
    applyOutgoingLocalLayoutAfterAttach(reason: "attach_local")
    if localIsMain { applyVideoSwap() }
  }

  func attachRemoteView(_ view: UIView) {
    ensureVideoRootForRemoteRender()
    remoteRenderView = view
    replaceSubview(in: remoteContainer, with: view, mediaOverlay: false)
    if localIsMain { applyVideoSwap() }
  }

  func clearVideoSurfaces() {
    cancelOutgoingTransition(reason: "clear_video_surfaces")
    teardownPipFrameBridge(reason: "clear_video_surfaces")
    localContainer.subviews.forEach { $0.removeFromSuperview() }
    remoteContainer.subviews.forEach { $0.removeFromSuperview() }
    remoteRenderView = nil
    localRenderView = nil
    localIsMain = false
    outgoingLocalFirstFrameReadyFlag = false
    outgoingRemoteFirstFrameReadyFlag = false
    outgoingTransitionCompleted = false
    lockedOutgoingPipTarget = nil
  }

  var isPictureInPictureActive: Bool {
    pipController?.isPictureInPictureActive == true
  }

  func outgoingLocalFirstFrameReady(width: Int, height: Int) {
    guard isOutgoingVideoPresentation, !outgoingLocalFirstFrameReadyFlag else { return }
    outgoingLocalFirstFrameReadyFlag = true
    NativeVideoCallLog.info(
      "outgoing_local_first_frame_ready",
      callId: boundCallId,
      details: outgoingLogDetails("width=\(width) height=\(height)")
    )
    applyState(currentState)
    maybeStartOutgoingTransition(reason: "local_first_frame")
  }

  func outgoingRemoteUserJoined(uid: UInt) {
    guard isOutgoingVideoPresentation else { return }
    NativeVideoCallLog.info(
      "outgoing_remote_user_joined",
      callId: boundCallId,
      details: outgoingLogDetails("uid=\(uid)")
    )
  }

  func outgoingRemoteFirstFrameReady(uid: UInt, width: Int, height: Int) {
    guard isOutgoingVideoPresentation, !outgoingRemoteFirstFrameReadyFlag else { return }
    outgoingRemoteFirstFrameReadyFlag = true
    NativeVideoCallLog.info(
      "outgoing_remote_first_frame_ready",
      callId: boundCallId,
      details: outgoingLogDetails("uid=\(uid) width=\(width) height=\(height)")
    )
    maybeStartOutgoingTransition(reason: "remote_first_frame")
  }

  private var isOutgoingVideoPresentation: Bool {
    session.initiator
  }

  private func applyOutgoingVideoPresentation(
    model: NativeVideoCallUiPresenter.Model,
    state: NativeVideoCallRuntimeState
  ) {
    videoRoot.isHidden = false
    if !outgoingTransitionCompleted && !outgoingTransitionRunning {
      applyOutgoingLocalFullscreenLayout()
    } else if outgoingTransitionCompleted {
      applyConnectedLocalPipLayout(reason: "outgoing_presentation_connected")
    }
    remoteContainer.isHidden = !outgoingRemoteFirstFrameReadyFlag
    remoteContainer.alpha = outgoingRemoteFirstFrameReadyFlag ? 1 : 0
    localContainer.isHidden = !outgoingLocalFirstFrameReadyFlag
    localContainer.alpha = outgoingLocalFirstFrameReadyFlag ? 1 : 0
    localContainer.isUserInteractionEnabled = outgoingTransitionCompleted && state == .connected
    activeActions.isHidden = false
    connectedControls.isHidden = false
    updateConnectedControlChrome()
    NativeVideoCallLog.info(
      "outgoing_controls_visible",
      callId: boundCallId,
      details: outgoingLogDetails("reason=outgoing_presentation")
    )
    NativeVideoCallLog.info(
      "outgoing_end_call_visible",
      callId: boundCallId,
      details: outgoingLogDetails("handler=NativeVideoCallRuntime.end")
    )
    statusPanel.isHidden = outgoingTransitionCompleted
    if outgoingLocalFirstFrameReadyFlag {
      overlayRoot.backgroundColor = .clear
      if !outgoingTransitionCompleted {
        NativeVideoCallLog.info(
          "outgoing_avatar_visible",
          callId: boundCallId,
          details: outgoingLogDetails("source=avatar_initial")
        )
      }
      NativeVideoCallLog.info(
        "outgoing_local_fullscreen_visible",
        callId: boundCallId,
        details: outgoingLogDetails("phase=\(model.phase)")
      )
    } else {
      overlayRoot.backgroundColor = UIColor(white: 0.08, alpha: 1)
      NativeVideoCallLog.info(
        "outgoing_video_ui_preparing",
        callId: boundCallId,
        details: outgoingLogDetails("phase=\(model.phase)")
      )
    }
    if state == .connected, outgoingRemoteFirstFrameReadyFlag {
      maybeStartOutgoingTransition(reason: "apply_state_connected")
    }
    if outgoingTransitionCompleted {
      NativeVideoCallLog.info("outgoing_avatar_hidden", callId: boundCallId, details: outgoingLogDetails("reason=connected"))
      NativeVideoCallLog.info("outgoing_duration_visible", callId: boundCallId, details: outgoingLogDetails("source=connectedAt"))
      NativeVideoCallLog.info("outgoing_signal_visible", callId: boundCallId, details: outgoingLogDetails("source=agora_networkQuality"))
      NativeVideoCallLog.info("outgoing_controls_layout_restored", callId: boundCallId, details: outgoingLogDetails("reason=connected"))
    }
  }

  private func applyOutgoingLocalLayoutAfterAttach(reason: String) {
    guard isOutgoingVideoPresentation, !currentState.isTerminal else { return }
    if outgoingTransitionCompleted {
      applyConnectedLocalPipLayout(reason: "attach_local_connected")
    } else {
      applyOutgoingLocalFullscreenLayout()
      localContainer.isHidden = !outgoingLocalFirstFrameReadyFlag
      localContainer.alpha = outgoingLocalFirstFrameReadyFlag ? 1 : 0
    }
    NativeVideoCallLog.info(
      "outgoing_video_ui_preparing",
      callId: boundCallId,
      details: outgoingLogDetails("reason=\(reason)")
    )
  }

  private func maybeStartOutgoingTransition(reason: String) {
    if suppressOutgoingTransitionRestart {
      NativeVideoCallLog.info(
        "outgoing_local_to_pip_transition_skipped",
        callId: boundCallId,
        details: outgoingLogDetails("reason=layout_restore")
      )
      return
    }
    guard isOutgoingVideoPresentation,
          currentState == .connected,
          outgoingLocalFirstFrameReadyFlag,
          outgoingRemoteFirstFrameReadyFlag,
          !outgoingTransitionRunning,
          !outgoingTransitionCompleted,
          !currentState.isTerminal else {
      NativeVideoCallLog.info(
        "outgoing_local_to_pip_transition_skipped",
        callId: boundCallId,
        details: outgoingLogDetails("reason=\(reason)")
      )
      return
    }
    guard view.window != nil, videoRoot.bounds.width > 0, videoRoot.bounds.height > 0 else {
      NativeVideoCallLog.info(
        "outgoing_local_to_pip_transition_skipped",
        callId: boundCallId,
        details: outgoingLogDetails("reason=layout_not_ready")
      )
      return
    }
    startOutgoingTransition(reason: reason)
  }

  private func startOutgoingTransition(reason: String) {
    outgoingTransitionRunning = true
    outgoingTransitionGeneration += 1
    let generation = outgoingTransitionGeneration
    remoteContainer.isHidden = false
    remoteContainer.alpha = 1
    localContainer.isHidden = false
    localContainer.alpha = 1
    localContainer.isUserInteractionEnabled = false
    view.layoutIfNeeded()
    let startFrame = localContainer.frame
    logOutgoingPipParentBounds(reason: "transition_prepare")
    logOutgoingPipInsetsResolved(reason: "transition_prepare")
    let target = resolveConnectedLocalPipFrame(positionSource: localPipCustomPosition ? "saved_drag" : "default")
    lockedOutgoingPipTarget = target
    logOutgoingPipTargetResolved(target, positionSource: localPipCustomPosition ? "saved_drag" : "default")
    NativeVideoCallLog.info(
      "outgoing_local_to_pip_transition_started",
      callId: boundCallId,
      details: outgoingLogDetails(
        "reason=\(reason) start=\(Int(startFrame.minX)),\(Int(startFrame.minY)),\(Int(startFrame.width))x\(Int(startFrame.height)) end=\(Int(target.leading)),\(Int(target.top)),\(Int(target.width))x\(Int(target.height))"
      )
    )
    localPipLeadingConstraint?.constant = target.leading
    localPipTopConstraint?.constant = target.top
    localPipWidthConstraint?.constant = target.width
    localPipHeightConstraint?.constant = target.height
    localPipLeading = target.leading
    localPipTop = target.top
    localContainer.layer.cornerRadius = 0
    videoRoot.bringSubviewToFront(localContainer)
    view.bringSubviewToFront(connectedChromeContainer)
    view.bringSubviewToFront(activeActions)
    let animator = UIViewPropertyAnimator(duration: 0.32, curve: .easeInOut) { [weak self] in
      guard let self else { return }
      self.localContainer.layer.cornerRadius = 8
      self.view.layoutIfNeeded()
    }
    animator.addCompletion { [weak self] _ in
      guard let self else { return }
      guard generation == self.outgoingTransitionGeneration, !self.currentState.isTerminal else { return }
      self.outgoingTransitionRunning = false
      self.outgoingTransitionCompleted = true
      self.outgoingTransitionAnimator = nil
      self.localContainer.isUserInteractionEnabled = true
      self.view.layoutIfNeeded()
      let measured = self.measureLocalContainerFrame()
      self.logOutgoingPipFinalFrameMeasured(
        target: target,
        measured: measured,
        reason: "transition_completed"
      )
      let delta = self.pipFrameDelta(expected: target, measured: measured)
      NativeVideoCallLog.info(
        "outgoing_local_to_pip_transition_completed",
        callId: self.boundCallId,
        details: self.outgoingPipLayoutDetails(
          reason: reason,
          target: target,
          measured: measured,
          positionSource: self.localPipCustomPosition ? "saved_drag" : "default"
        )
      )
      NativeVideoCallLog.info(
        "outgoing_video_connected_ui_ready",
        callId: self.boundCallId,
        details: self.outgoingLogDetails("reason=transition_completed targetDeltaPx=\(Int(delta.rounded()))")
      )
      DispatchQueue.main.async {
        guard generation == self.outgoingTransitionGeneration, !self.currentState.isTerminal else { return }
        let layoutPassMeasured = self.measureLocalContainerFrame()
        self.logOutgoingPipFinalFrameMeasured(
          target: target,
          measured: layoutPassMeasured,
          reason: "transition_completed_layout_pass"
        )
        self.verifyPipPositionAfterLayout(reason: "transition_completed_layout_pass", expected: target)
      }
      self.applyState(self.currentState)
    }
    outgoingTransitionAnimator = animator
    animator.startAnimation()
  }

  private func cancelOutgoingTransition(reason: String) {
    outgoingTransitionGeneration += 1
    if outgoingTransitionAnimator != nil || outgoingTransitionRunning {
      outgoingTransitionAnimator?.stopAnimation(true)
      NativeVideoCallLog.info(
        "outgoing_video_transition_cancelled",
        callId: boundCallId,
        details: outgoingLogDetails("reason=\(reason)")
      )
    }
    outgoingTransitionAnimator = nil
    outgoingTransitionRunning = false
    if currentState == .connected {
      outgoingTransitionCompleted = true
    }
    lockedOutgoingPipTarget = nil
  }

  private func shouldSkipConnectedPipLayout() -> Bool {
    isOutgoingVideoPresentation && !outgoingTransitionCompleted && !outgoingTransitionRunning
  }

  /** CONNECTED PiP 복귀 — 발신 전환 플래그 + 보조 PiP SSOT (applyState만으로는 bounds 미복원). */
  private func syncOutgoingFlagsForConnectedLayoutRestore() {
    guard isOutgoingVideoPresentation, currentState == .connected else { return }
    cancelOutgoingTransition(reason: "connected_layout_restore")
    outgoingTransitionCompleted = true
    outgoingLocalFirstFrameReadyFlag = true
    outgoingRemoteFirstFrameReadyFlag = true
  }

  private func restoreConnectedFullscreenVideoLayout(reason: String) {
    guard currentState == .connected else { return }
    suppressOutgoingTransitionRestart = true
    defer { suppressOutgoingTransitionRestart = false }
    syncOutgoingFlagsForConnectedLayoutRestore()
    refreshConnectedVideoShellAfterRestore(reason: reason)
  }

  private func refreshConnectedVideoShellAfterRestore(reason: String) {
    if localIsMain { resetVideoSwapForPip() }
    videoRoot.isHidden = false
    overlayRoot.isHidden = false
    overlayRoot.backgroundColor = .clear
    statusPanel.isHidden = true
    remoteContainer.isHidden = false
    remoteContainer.alpha = 1
    localContainer.isHidden = false
    localContainer.alpha = 1
    _ = ensureVideoRootForRemoteRender()
    guard !shouldSkipConnectedPipLayout() else { return }
    applyConnectedLocalPipLayout(reason: reason, layoutNow: true)
    NativeVideoCallAgoraEngine.shared.onRemoteRenderSurfaceReady(callId: boundCallId)
    NativeVideoCallLog.info(
      "native_video_connected_shell_restored",
      callId: boundCallId,
      details: "reason=\(reason) localAttached=\(localContainer.subviews.count) remoteAttached=\(remoteContainer.subviews.count)"
    )
  }

  private func applyOutgoingLocalFullscreenLayout() {
    guard videoRoot.bounds.width > 0, videoRoot.bounds.height > 0 else { return }
    localPipLeading = 0
    localPipTop = -videoRoot.safeAreaInsets.top
    localPipLeadingConstraint?.constant = localPipLeading
    localPipTopConstraint?.constant = localPipTop
    localPipWidthConstraint?.constant = videoRoot.bounds.width
    localPipHeightConstraint?.constant = videoRoot.bounds.height
    localContainer.layer.cornerRadius = 0
    localContainer.transform = .identity
  }

  /** SSOT: connected 보조 PiP frame. transition·final layout·기본 배치 공통. */
  private func resolveConnectedLocalPipFrame(positionSource: String) -> ResolvedPipFrame {
    let width = Self.localPipWidth
    let height = Self.localPipHeight
    let insets = videoRoot.safeAreaInsets
    let leading: CGFloat
    let top: CGFloat
    if localPipCustomPosition {
      logOutgoingPipSavedPositionResolved()
      let clamped = clampLocalPipPosition(leading: localPipLeading, top: localPipTop)
      leading = clamped.leading
      top = clamped.top
    } else {
      let defaultTop =
        videoRoot.bounds.height - insets.top - insets.bottom - height - Self.localPipMargin
      let clamped = clampLocalPipPosition(leading: insets.left + Self.localPipMargin, top: defaultTop)
      leading = clamped.leading
      top = clamped.top
    }
    _ = positionSource
    return ResolvedPipFrame(leading: leading, top: top, width: width, height: height)
  }

  private func applyConnectedLocalPipLayout(reason: String, layoutNow: Bool = true) {
    guard !shouldSkipConnectedPipLayout() else { return }
    pipLayoutPassCount += 1
    let frame = resolveConnectedLocalPipFrame(positionSource: localPipCustomPosition ? "saved_drag" : "default")
    localPipWidthConstraint?.constant = frame.width
    localPipHeightConstraint?.constant = frame.height
    applyLocalPipPosition(leading: frame.leading, top: frame.top)
    localContainer.layer.cornerRadius = 8
    localContainer.transform = .identity
    if layoutNow {
      view.layoutIfNeeded()
    }
    let measured = measureLocalContainerFrame()
    NativeVideoCallLog.info(
      "outgoing_pip_layout_reapplied",
      callId: boundCallId,
      details: outgoingPipLayoutDetails(
        reason: reason,
        target: frame,
        measured: measured,
        positionSource: localPipCustomPosition ? "saved_drag" : "default"
      )
    )
    if outgoingTransitionCompleted, let locked = lockedOutgoingPipTarget {
      verifyPipPositionAfterLayout(reason: reason, expected: locked)
    }
  }

  private func measureLocalContainerFrame() -> ResolvedPipFrame {
    let frame = localContainer.frame
    let insets = videoRoot.safeAreaInsets
    return ResolvedPipFrame(
      leading: frame.minX,
      top: frame.minY - insets.top,
      width: frame.width,
      height: frame.height
    )
  }

  private func pipFrameDelta(expected: ResolvedPipFrame, measured: ResolvedPipFrame) -> CGFloat {
    abs(measured.leading - expected.leading)
      + abs(measured.top - expected.top)
      + abs(measured.width - expected.width)
      + abs(measured.height - expected.height)
  }

  private func verifyPipPositionAfterLayout(reason: String, expected: ResolvedPipFrame) {
    let measured = measureLocalContainerFrame()
    if pipFrameDelta(expected: expected, measured: measured) > 1 {
      NativeVideoCallLog.info(
        "outgoing_pip_unexpected_position_change",
        callId: boundCallId,
        details: outgoingPipLayoutDetails(
          reason: reason,
          target: expected,
          measured: measured,
          positionSource: "unexpected"
        )
      )
    }
  }

  private func logOutgoingPipParentBounds(reason: String) {
    NativeVideoCallLog.info(
      "outgoing_pip_parent_bounds",
      callId: boundCallId,
      details: outgoingLogDetails(
        "reason=\(reason) orientation=\(currentInterfaceOrientation()) parentX=0 parentY=0 parentWidth=\(Int(videoRoot.bounds.width)) parentHeight=\(Int(videoRoot.bounds.height)) layoutPassCount=\(pipLayoutPassCount)"
      )
    )
  }

  private func logOutgoingPipInsetsResolved(reason: String) {
    let insets = videoRoot.safeAreaInsets
    NativeVideoCallLog.info(
      "outgoing_pip_insets_resolved",
      callId: boundCallId,
      details: outgoingLogDetails(
        "reason=\(reason) safeLeft=\(Int(insets.left)) safeTop=\(Int(insets.top)) safeRight=\(Int(insets.right)) safeBottom=\(Int(insets.bottom))"
      )
    )
  }

  private func logOutgoingPipSavedPositionResolved() {
    NativeVideoCallLog.info(
      "outgoing_pip_saved_position_resolved",
      callId: boundCallId,
      details: outgoingLogDetails(
        "savedLeading=\(Int(localPipLeading)) savedTop=\(Int(localPipTop)) savedPositionUsed=true positionSource=saved_drag"
      )
    )
  }

  private func logOutgoingPipTargetResolved(_ target: ResolvedPipFrame, positionSource: String) {
    NativeVideoCallLog.info(
      "outgoing_pip_target_resolved",
      callId: boundCallId,
      details: outgoingPipLayoutDetails(
        reason: "transition_target",
        target: target,
        measured: target,
        positionSource: positionSource
      )
    )
  }

  private func logOutgoingPipFinalFrameMeasured(
    target: ResolvedPipFrame,
    measured: ResolvedPipFrame,
    reason: String
  ) {
    NativeVideoCallLog.info(
      "outgoing_pip_final_frame_measured",
      callId: boundCallId,
      details: outgoingPipLayoutDetails(
        reason: reason,
        target: target,
        measured: measured,
        positionSource: "measured"
      )
    )
  }

  private func outgoingPipLayoutDetails(
    reason: String,
    target: ResolvedPipFrame,
    measured: ResolvedPipFrame,
    positionSource: String
  ) -> String {
    let insets = videoRoot.safeAreaInsets
    let delta = pipFrameDelta(expected: target, measured: measured)
    return outgoingLogDetails(
      "reason=\(reason) orientation=\(currentInterfaceOrientation()) parentWidth=\(Int(videoRoot.bounds.width)) parentHeight=\(Int(videoRoot.bounds.height)) safeTop=\(Int(insets.top)) safeBottom=\(Int(insets.bottom)) safeLeft=\(Int(insets.left)) safeRight=\(Int(insets.right)) pipWidth=\(Int(target.width)) pipHeight=\(Int(target.height)) targetX=\(Int(target.leading)) targetY=\(Int(target.top)) finalX=\(Int(measured.leading)) finalY=\(Int(measured.top)) finalWidth=\(Int(measured.width)) finalHeight=\(Int(measured.height)) deltaX=\(Int(abs(measured.leading - target.leading))) deltaY=\(Int(abs(measured.top - target.top))) deltaWidth=\(Int(abs(measured.width - target.width))) deltaHeight=\(Int(abs(measured.height - target.height))) targetDeltaPx=\(Int(delta.rounded())) savedPositionUsed=\(localPipCustomPosition) positionSource=\(positionSource) layoutPassCount=\(pipLayoutPassCount) transitionCompleted=\(outgoingTransitionCompleted)"
    )
  }

  private func currentInterfaceOrientation() -> Int {
    view.window?.windowScene?.interfaceOrientation.rawValue ?? 0
  }

  private func outgoingLogDetails(_ extra: String) -> String {
    "platform=ios initiator=\(session.initiator) runtimeState=\(currentState) localFrameReady=\(outgoingLocalFirstFrameReadyFlag) remoteFrameReady=\(outgoingRemoteFirstFrameReadyFlag) transitionRunning=\(outgoingTransitionRunning) transitionCompleted=\(outgoingTransitionCompleted) localAttached=\(localContainer.subviews.count) remoteAttached=\(remoteContainer.subviews.count) \(extra)"
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
    if enabled { cancelConnectedChromeHide(reason: "pip_enter") }
    inPipMode = enabled
    overlayRoot.isHidden = enabled
    activeActions.isHidden = enabled
    localContainer.isHidden = enabled
    syncPersistentCallStatusVisibility()
    if !enabled {
      if currentState == .connected {
        syncOutgoingFlagsForConnectedLayoutRestore()
      }
      applyState(currentState)
      if currentState == .connected {
        restoreConnectedFullscreenVideoLayout(reason: "pip_ui_restore")
      }
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
    if localIsMain { resetVideoSwapForPip() }
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
    let localWidth = localContainer.widthAnchor.constraint(equalToConstant: Self.localPipWidth)
    let localHeight = localContainer.heightAnchor.constraint(equalToConstant: Self.localPipHeight)
    localPipWidthConstraint = localWidth
    localPipHeightConstraint = localHeight
    NSLayoutConstraint.activate([
      remoteContainer.topAnchor.constraint(equalTo: videoRoot.topAnchor),
      remoteContainer.leadingAnchor.constraint(equalTo: videoRoot.leadingAnchor),
      remoteContainer.trailingAnchor.constraint(equalTo: videoRoot.trailingAnchor),
      remoteContainer.bottomAnchor.constraint(equalTo: videoRoot.bottomAnchor),
      localWidth,
      localHeight,
    ])
    // 가변 leading/top (드래그 이동용). 기본 위치는 viewDidLayoutSubviews에서 좌하단으로 설정.
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

    buildConnectedChrome()

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
    configureMediaButton(
      cameraFlipButton,
      symbolName: "camera.rotate.fill",
      fallbackSymbolName: "camera.fill",
      accessibilityLabel: "카메라 전환",
      danger: false
    )
    configureMediaButton(
      cameraButton,
      symbolName: "video.fill",
      fallbackSymbolName: "video.fill",
      accessibilityLabel: "카메라 켬",
      danger: false
    )
    configureMediaButton(
      micButton,
      symbolName: "mic.fill",
      fallbackSymbolName: "mic.fill",
      accessibilityLabel: "음소거",
      danger: false
    )
    configureMediaButton(
      endButton,
      symbolName: "phone.down.fill",
      fallbackSymbolName: "phone.down.fill",
      accessibilityLabel: "종료",
      danger: true
    )

    incomingActions.axis = .horizontal
    incomingActions.spacing = 24
    incomingActions.distribution = .fillEqually
    incomingActions.addArrangedSubview(declineButton)
    incomingActions.addArrangedSubview(acceptButton)

    connectedControls.axis = .vertical
    connectedControls.spacing = 12
    connectedControls.addArrangedSubview(cameraFlipButton)
    connectedControls.addArrangedSubview(cameraButton)
    connectedControls.addArrangedSubview(micButton)
    connectedControls.addArrangedSubview(endButton)

    activeActions.axis = .vertical
    activeActions.spacing = 0
    activeActions.addArrangedSubview(connectedControls)

    incomingActions.translatesAutoresizingMaskIntoConstraints = false
    activeActions.translatesAutoresizingMaskIntoConstraints = false
    overlayRoot.addSubview(incomingActions)
    overlayRoot.addSubview(activeActions)
    NSLayoutConstraint.activate([
      incomingActions.leadingAnchor.constraint(equalTo: overlayRoot.leadingAnchor, constant: 24),
      incomingActions.trailingAnchor.constraint(equalTo: overlayRoot.trailingAnchor, constant: -24),
      incomingActions.bottomAnchor.constraint(equalTo: overlayRoot.safeAreaLayoutGuide.bottomAnchor, constant: -32),
      activeActions.trailingAnchor.constraint(equalTo: overlayRoot.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      activeActions.bottomAnchor.constraint(equalTo: overlayRoot.safeAreaLayoutGuide.bottomAnchor, constant: -32),
    ])
    attachBackgroundChromeTapGesture()
    videoRoot.isHidden = true
    localContainer.isHidden = true
  }

  private func buildConnectedChrome() {
    connectedChromeContainer.translatesAutoresizingMaskIntoConstraints = false
    connectedChromeContainer.isUserInteractionEnabled = false
    connectedChromeContainer.isHidden = true
    view.addSubview(connectedChromeContainer)
    NSLayoutConstraint.activate([
      connectedChromeContainer.topAnchor.constraint(equalTo: view.topAnchor),
      connectedChromeContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      connectedChromeContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      connectedChromeContainer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    connectedPeerNameLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    connectedPeerNameLabel.textColor = UIColor(red: 241 / 255, green: 248 / 255, blue: 244 / 255, alpha: 1)
    connectedPeerNameLabel.numberOfLines = 1
    connectedPeerNameLabel.lineBreakMode = .byTruncatingTail

    connectedDurationLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .regular)
    connectedDurationLabel.textColor = UIColor(red: 212 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)

    connectedSignalLabel.font = .systemFont(ofSize: 13, weight: .regular)
    connectedSignalLabel.textColor = UIColor(red: 212 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)

    let barsStack = UIStackView()
    barsStack.axis = .horizontal
    barsStack.spacing = 2
    barsStack.alignment = .bottom
    let barHeights: [CGFloat] = [6, 9, 12, 15]
    for height in barHeights {
      let bar = UIView()
      bar.translatesAutoresizingMaskIntoConstraints = false
      bar.backgroundColor = UIColor(red: 212 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)
      bar.widthAnchor.constraint(equalToConstant: 3).isActive = true
      bar.heightAnchor.constraint(equalToConstant: height).isActive = true
      barsStack.addArrangedSubview(bar)
      connectedSignalBars.append(bar)
    }

    let metaRow = UIStackView(arrangedSubviews: [connectedDurationLabel, barsStack, connectedSignalLabel])
    metaRow.axis = .horizontal
    metaRow.spacing = 12
    metaRow.alignment = .center

    let infoStack = UIStackView(arrangedSubviews: [connectedPeerNameLabel, metaRow])
    infoStack.axis = .vertical
    infoStack.spacing = 4
    infoStack.translatesAutoresizingMaskIntoConstraints = false
    connectedChromeContainer.addSubview(infoStack)
    connectedPeerNameLabel.textAlignment = .center
    connectedDurationLabel.textAlignment = .center
    connectedSignalLabel.textAlignment = .center
    infoStack.alignment = .center
    NSLayoutConstraint.activate([
      infoStack.topAnchor.constraint(equalTo: connectedChromeContainer.safeAreaLayoutGuide.topAnchor, constant: 8),
      infoStack.centerXAnchor.constraint(equalTo: connectedChromeContainer.safeAreaLayoutGuide.centerXAnchor),
      infoStack.leadingAnchor.constraint(greaterThanOrEqualTo: connectedChromeContainer.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      infoStack.trailingAnchor.constraint(lessThanOrEqualTo: connectedChromeContainer.safeAreaLayoutGuide.trailingAnchor, constant: -16),
    ])
    updateNetworkSignalUi()
  }

  private func configureActionButton(_ button: UIButton, title: String, color: UIColor) {
    button.setTitle(title, for: .normal)
    button.setTitleColor(color, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    button.backgroundColor = UIColor(white: 0.15, alpha: 0.85)
    button.layer.cornerRadius = 8
    button.contentEdgeInsets = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
  }

  private func configureMediaButton(
    _ button: UIButton,
    symbolName: String,
    fallbackSymbolName: String,
    accessibilityLabel: String,
    danger: Bool
  ) {
    button.setTitle(nil, for: .normal)
    button.setImage(UIImage(systemName: symbolName) ?? UIImage(systemName: fallbackSymbolName), for: .normal)
    button.accessibilityLabel = accessibilityLabel
    button.backgroundColor = danger
      ? UIColor(red: 0.86, green: 0.2, blue: 0.24, alpha: 1)
      : UIColor(white: 0.22, alpha: 0.85)
    button.tintColor = .white
    button.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      button.widthAnchor.constraint(equalToConstant: 56),
      button.heightAnchor.constraint(equalToConstant: 56),
    ])
    button.layer.cornerRadius = 28
    button.clipsToBounds = true
  }

  private func bindActions() {
    acceptButton.addTarget(self, action: #selector(onAcceptTapped), for: .touchUpInside)
    declineButton.addTarget(self, action: #selector(onDeclineTapped), for: .touchUpInside)
    endButton.addTarget(self, action: #selector(onEndTapped), for: .touchUpInside)
    cameraButton.addTarget(self, action: #selector(onCameraTapped), for: .touchUpInside)
    cameraFlipButton.addTarget(self, action: #selector(onCameraFlipTapped), for: .touchUpInside)
    micButton.addTarget(self, action: #selector(onMicTapped), for: .touchUpInside)
  }

  private func attachBackgroundChromeTapGesture() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(onBackgroundTapped(_:)))
    tap.cancelsTouchesInView = false
    tap.delegate = self
    videoRoot.addGestureRecognizer(tap)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    let pointInVideo = touch.location(in: videoRoot)
    let pointInLocal = touch.location(in: localContainer)
    let pointInControls = touch.location(in: activeActions)
    if localContainer.bounds.contains(pointInLocal) { return false }
    if activeActions.bounds.contains(pointInControls) { return false }
    return videoRoot.bounds.contains(pointInVideo) && isConnectedFullscreenPresentation
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    false
  }

  @objc private func onBackgroundTapped(_ gesture: UITapGestureRecognizer) {
    guard gesture.state == .ended, isConnectedFullscreenPresentation else { return }
    showConnectedChrome(source: "background_tap")
  }

  private var isConnectedFullscreenPresentation: Bool {
    currentState == .connected && !inPipMode
  }

  private func showConnectedChrome(source: String) {
    cancelConnectedChromeHide(reason: "show_\(source)")
    setConnectedChromeViewsVisible(true)
    if !isChromeVisible {
      NativeVideoCallLog.info(
        "native_video_chrome_shown",
        callId: boundCallId,
        details: "source=\(source) connected=\(currentState == .connected) presentation=fullscreen nicknameSource=session_callerName_sanitized"
      )
    }
    isChromeVisible = true
    // Option A: CONNECTED fullscreen keeps status + right FAB persistent (no auto-hide).
  }

  private func hideConnectedChrome(source: String) {
    // Option A: do not auto-hide connected status/FAB.
    cancelConnectedChromeHide(reason: "hide_\(source)")
  }

  private func setConnectedChromeViewsVisible(_ visible: Bool) {
    activeActions.alpha = 1
    activeActions.isHidden = !visible
    activeActions.isUserInteractionEnabled = visible
    connectedControls.alpha = 1
    connectedControls.isHidden = !visible
    connectedControls.isUserInteractionEnabled = visible
    // Option A: status + FAB stay visible together while CONNECTED fullscreen.
    syncPersistentCallStatusVisibility()
  }

  /** CONNECTED + fullscreen — status and right FAB both persistent. */
  private func syncPersistentCallStatusVisibility() {
    let show = currentState == .connected && !inPipMode
    connectedChromeContainer.isHidden = !show
    if show {
      activeActions.isHidden = false
      activeActions.isUserInteractionEnabled = true
      connectedControls.isHidden = false
      connectedControls.isUserInteractionEnabled = true
      isChromeVisible = true
      view.bringSubviewToFront(connectedChromeContainer)
      view.bringSubviewToFront(activeActions)
    }
  }

  private func scheduleConnectedChromeHide(source: String) {
    // Option A: auto-hide disabled for connected chrome / FAB.
    cancelConnectedChromeHide(reason: "schedule_disabled_\(source)")
  }

  private func cancelConnectedChromeHide(reason: String) {
    chromeHideWorkItem?.cancel()
    chromeHideWorkItem = nil
  }

  private func updateConnectedControlChrome() {
    cameraButton.setImage(UIImage(systemName: cameraEnabled ? "video.fill" : "video.slash.fill"), for: .normal)
    cameraButton.accessibilityLabel = cameraEnabled ? "카메라 끔" : "카메라 켬"
    micButton.setImage(UIImage(systemName: micMuted ? "mic.slash.fill" : "mic.fill"), for: .normal)
    micButton.accessibilityLabel = micMuted ? "음소거 해제" : "음소거"
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

  /** 기본 위치: 좌하단(안전영역 기준 margin). */
  private func applyDefaultLocalPipPosition() {
    applyConnectedLocalPipLayout(reason: "default_position")
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
    if isConnectedFullscreenPresentation && !isChromeVisible {
      showConnectedChrome(source: "app_active")
    }
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
    NativeVideoCallAgoraEngine.shared.setCameraEnabled(cameraEnabled)
    updateConnectedControlChrome()
    showConnectedChrome(source: "video_toggle")
  }

  @objc private func onCameraFlipTapped() {
    NativeVideoCallAgoraEngine.shared.switchCameraFacing()
    showConnectedChrome(source: "camera_flip")
  }

  @objc private func onMicTapped() {
    micMuted.toggle()
    let applied = NativeVideoCallAgoraEngine.shared.setMicMuted(micMuted)
    if !applied {
      micMuted.toggle()
    }
    updateConnectedControlChrome()
    NativeVideoCallLog.info(
      "native_video_mic_muted_changed",
      callId: boundCallId,
      details: "source=button connected=\(currentState == .connected) presentation=fullscreen requestedMuted=\(micMuted) result=\(applied)"
    )
    showConnectedChrome(source: "mic_toggle")
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
      connectedDurationLabel.text = nil
      return
    }
    let elapsed = max(0, Int(Date().timeIntervalSince(connectedAt)))
    let label = Self.formatConnectedDuration(elapsedSeconds: elapsed)
    durationLabel.text = label
    connectedDurationLabel.text = label
  }

  private static func formatConnectedDuration(elapsedSeconds: Int) -> String {
    let hours = elapsedSeconds / 3600
    let minutes = (elapsedSeconds % 3600) / 60
    let seconds = elapsedSeconds % 60
    if hours > 0 {
      return String(format: "%d:%02d:%02d", hours, minutes, seconds)
    }
    return String(format: "%02d:%02d", minutes, seconds)
  }

  private func updateConnectedInfoPanel(_ model: NativeVideoCallUiPresenter.Model) {
    syncPersistentCallStatusVisibility()
    guard model.showConnectedControls, model.showVideoSurfaces else {
      return
    }
    connectedPeerNameLabel.text = model.peerName
    updateDurationLabel()
    updateNetworkSignalUi()
  }

  private func handleNetworkQualitySample(worst: Int) {
    guard currentState == .connected else { return }
    let previousTier = displayedNetworkTier
    let instantTier = networkTierFromAgora(worst)
    var nextTier = displayedNetworkTier
    if instantTier == .veryPoor {
      nextTier = .veryPoor
      networkRecoveryStableCount = 0
    } else if tierRank(instantTier) > tierRank(displayedNetworkTier) {
      nextTier = instantTier
      networkRecoveryStableCount = 0
    } else if tierRank(instantTier) < tierRank(displayedNetworkTier) {
      networkRecoveryStableCount += 1
      if networkRecoveryStableCount >= 2 {
        nextTier = instantTier
        networkRecoveryStableCount = 0
      }
    } else {
      networkRecoveryStableCount = 0
    }
    if nextTier != displayedNetworkTier {
      NativeVideoCallLog.info(
        "native_video_network_quality_changed",
        callId: boundCallId,
        details: "source=agora_networkQuality previousQuality=\(previousTier) currentQuality=\(nextTier) chromeVisible=\(isChromeVisible) connected=\(currentState == .connected) presentation=fullscreen"
      )
      displayedNetworkTier = nextTier
      updateNetworkSignalUi()
    }
    if nextTier == .veryPoor && previousTier != .veryPoor {
      showNetworkVeryPoorChrome(previousTier: previousTier)
    } else if nextTier != .veryPoor {
      networkVeryPoorActive = false
    }
  }

  private func showNetworkVeryPoorChrome(previousTier: NetworkDisplayTier) {
    if networkVeryPoorActive { return }
    networkVeryPoorActive = true
    let chromeWasVisible = isChromeVisible
    showConnectedChrome(source: "network_quality_very_poor")
    NativeVideoCallLog.info(
      "native_video_network_quality_alert_shown",
      callId: boundCallId,
      details: "source=network_quality_very_poor previousQuality=\(previousTier) currentQuality=veryPoor chromeWasVisible=\(chromeWasVisible) connected=true presentation=fullscreen"
    )
  }

  private func tierRank(_ tier: NetworkDisplayTier) -> Int {
    switch tier {
    case .good: return 0
    case .fair: return 1
    case .poor: return 2
    case .veryPoor: return 3
    }
  }

  private func networkTierFromAgora(_ worstQuality: Int) -> NetworkDisplayTier {
    if worstQuality <= 2 { return .good }
    if worstQuality == 3 { return .fair }
    if worstQuality == 4 { return .poor }
    return .veryPoor
  }

  private func updateNetworkSignalUi() {
    let activeBars: Int
    let label: String
    let color: UIColor
    switch displayedNetworkTier {
    case .fair:
      activeBars = 3
      label = "보통"
      color = UIColor(red: 212 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)
    case .poor:
      activeBars = 2
      label = "나쁨"
      color = UIColor(red: 245 / 255, green: 194 / 255, blue: 107 / 255, alpha: 1)
    case .veryPoor:
      activeBars = 1
      label = "매우 나쁨"
      color = UIColor(red: 242 / 255, green: 139 / 255, blue: 130 / 255, alpha: 1)
    case .good:
      activeBars = 4
      label = "좋음"
      color = UIColor(red: 212 / 255, green: 233 / 255, blue: 226 / 255, alpha: 1)
    }
    connectedSignalLabel.text = label
    connectedSignalLabel.textColor = color
    for (index, bar) in connectedSignalBars.enumerated() {
      bar.alpha = index < activeBars ? 1 : 0.28
      bar.backgroundColor = color
    }
  }
}

@available(iOS 15.0, *)
extension NativeVideoCallViewController: AVPictureInPictureControllerDelegate {
  func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
    cancelConnectedChromeHide(reason: "pip_will_start")
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
    if currentState == .connected {
      showConnectedChrome(source: "pip_exit")
    }
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
    if currentState == .connected {
      showConnectedChrome(source: "pip_restore")
    }
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

private extension NativeVideoCallRuntimeState {
  var isTerminal: Bool {
    self == .ending || self == .ended || self == .failed
  }
}
