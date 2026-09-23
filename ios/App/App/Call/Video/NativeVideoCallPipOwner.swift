import AVKit
import UIKit

/**
 * CUT-6B — PiP ContentSource / controller ownership outside the fullscreen VC.
 *
 * Phase-1 gate: before extraction, pipController / contentVC / ContentSource lived ONLY on
 * NativeVideoCallViewController. Dismissing that VC would deinit PiP → LIFETIME_BLOCKER.
 *
 * This owner keeps PiP + remote media path alive across RELEASE_FULLSCREEN_FOR_PIP.
 * Call session authority remains NativeVideoCallRuntime (unchanged).
 */
@available(iOS 15.0, *)
final class NativeVideoCallPipOwner: NSObject, AVPictureInPictureControllerDelegate {
  static let shared = NativeVideoCallPipOwner()

  /// UI presentation only — not call session state.
  enum UiPresentationState: String {
    case fullscreen
    case pipActiveAppUsable
    case fullscreenRestored
  }

  private(set) var boundCallId: String?
  private(set) var uiPresentationState: UiPresentationState = .fullscreen
  private(set) var fullscreenReleasedForPip = false

  private var pipController: AVPictureInPictureController?
  private var pipContentViewController: AVPictureInPictureVideoCallViewController?
  private var contentSource: AVPictureInPictureController.ContentSource?
  /// ContentSource.activeVideoCallSourceView is weak — must be retained here.
  private var sourceAnchorView: UIView?
  private var remoteRenderView: UIView?
  private var pipFrameBridge: NativeVideoCallPipFrameBridge?
  private weak var fullscreenController: NativeVideoCallViewController?
  private var restoreCompletion: ((Bool) -> Void)?

  var isPictureInPictureActive: Bool {
    pipController?.isPictureInPictureActive == true
  }

  func isBound(to callId: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, let bound = boundCallId else { return false }
    return bound == sid
  }

  /// While PiP owns the app-usable path, Runtime snapshot must not auto-present fullscreen.
  func shouldBlockAutoPresent(callId: String) -> Bool {
    isBound(to: callId) && fullscreenReleasedForPip && uiPresentationState == .pipActiveAppUsable
  }

  func configureIfNeeded(
    callId: String,
    sourceView: UIView,
    fullscreen: NativeVideoCallViewController
  ) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    guard AVPictureInPictureController.isPictureInPictureSupported() else { return }

    if pipController != nil, isBound(to: sid) {
      // Refresh weak fullscreen pointer for willStart reparent (same call, same owner).
      fullscreenController = fullscreen
      sourceAnchorView = sourceView
      return
    }

    teardownSession(reason: "reconfigure", stopPip: pipController?.isPictureInPictureActive == true)

    // CUT-6E: teardownSession clears fullscreenController. willStart requires it for
    // reparent + native_video_pip_entered; didStart does not. Restore after teardown.
    boundCallId = sid
    fullscreenController = fullscreen
    sourceAnchorView = sourceView
    let pipVC = AVPictureInPictureVideoCallViewController()
    pipVC.preferredContentSize = CGSize(width: 9, height: 16)
    pipContentViewController = pipVC
    let source = AVPictureInPictureController.ContentSource(
      activeVideoCallSourceView: sourceView,
      contentViewController: pipVC
    )
    contentSource = source
    let controller = AVPictureInPictureController(contentSource: source)
    controller.canStartPictureInPictureAutomaticallyFromInline = true
    controller.delegate = self
    pipController = controller
    uiPresentationState = .fullscreen
    fullscreenReleasedForPip = false
    NativeVideoCallLog.info("native_video_pip_owner_configured", callId: sid)
  }

  func setAutomaticPipFromInline(_ enabled: Bool) {
    pipController?.canStartPictureInPictureAutomaticallyFromInline = enabled
  }

  @discardableResult
  func tryEnter(source: String) -> Bool {
    guard let sid = boundCallId, let pipController else {
      NativeVideoCallLog.info(
        "native_video_pip_blocked",
        callId: boundCallId ?? "unknown",
        details: "source=\(source) no_controller"
      )
      return false
    }
    if pipController.isPictureInPictureActive {
      return true
    }
    pipController.startPictureInPicture()
    NativeVideoCallLog.info("native_video_pip_enter_requested", callId: sid, details: "source=\(source)")
    return true
  }

  func stopIfActive() {
    guard pipController?.isPictureInPictureActive == true else { return }
    if let vc = fullscreenController {
      vc.reparentRemoteViewToFullscreenForPipOwner()
      vc.applyPipUiMode(false)
    }
    pipController?.stopPictureInPicture()
  }

  func contentViewControllerForReparent() -> UIViewController? {
    pipContentViewController
  }

  func adoptRemoteRenderView(_ view: UIView?) {
    remoteRenderView = view
  }

  func attachRemoteViewToPipContent(_ view: UIView) {
    guard let pipVC = pipContentViewController else { return }
    remoteRenderView = view
    view.removeFromSuperview()
    view.translatesAutoresizingMaskIntoConstraints = false
    pipVC.view.addSubview(view)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: pipVC.view.topAnchor),
      view.leadingAnchor.constraint(equalTo: pipVC.view.leadingAnchor),
      view.trailingAnchor.constraint(equalTo: pipVC.view.trailingAnchor),
      view.bottomAnchor.constraint(equalTo: pipVC.view.bottomAnchor),
    ])
  }

  func adoptFrameBridge(_ bridge: NativeVideoCallPipFrameBridge?) {
    pipFrameBridge = bridge
  }

  func frameBridge() -> NativeVideoCallPipFrameBridge? {
    pipFrameBridge
  }

  func clearFrameBridge(reason: String) {
    pipFrameBridge?.deactivate()
    pipFrameBridge = nil
    NativeVideoCallLog.info(
      "native_video_pip_frame_bridge_cleared",
      callId: boundCallId ?? "unknown",
      details: "reason=\(reason)"
    )
  }

  /// Terminal / END_CALL path — stops PiP and drops all strong refs.
  func teardownForTerminal(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard isBound(to: sid) || boundCallId == nil else { return }
    teardownSession(reason: "terminal", stopPip: true)
  }

  /// VC deinit must not tear down an active PiP session owned here.
  func noteFullscreenControllerDeinit(_ controller: NativeVideoCallViewController) {
    if fullscreenController === controller {
      fullscreenController = nil
    }
  }

  // MARK: - AVPictureInPictureControllerDelegate

  func pictureInPictureControllerWillStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    guard let sid = boundCallId else { return }
    guard let vc = fullscreenController else { return }
    vc.cancelConnectedChromeHideForPipOwner(reason: "pip_will_start")
    vc.resetVideoSwapForPipOwner()
    vc.reparentRemoteViewToPipForPipOwner()
    vc.attachPipFrameHostIfNeededForPipOwner()
    vc.applyPipUiMode(true)
    ScreenAwakeBridge.shared.notifyPresentationChanged(callId: sid, presentation: "pip")
    DibayCallPipPlugin.publishPipModeChanged(inPipMode: true, callId: sid)
    NativeVideoCallLog.info("native_video_pip_entered", callId: sid)
  }

  func pictureInPictureControllerDidStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    guard let sid = boundCallId else { return }
    // Release only after PiP is established — not on willStart / button tap.
    NativeVideoCallUiHost.releaseFullscreenForPip(callId: sid)
    fullscreenReleasedForPip = true
    uiPresentationState = .pipActiveAppUsable
    NativeVideoCallLog.info(
      "release_fullscreen_for_pip",
      callId: sid,
      details: "trigger=pictureInPictureControllerDidStartPictureInPicture"
    )
  }

  func pictureInPictureControllerDidStopPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    guard let sid = boundCallId else { return }
    clearFrameBridge(reason: "pip_did_stop")
    if let vc = fullscreenController {
      vc.reparentRemoteViewToFullscreenForPipOwner()
      vc.applyPipUiMode(false)
      if vc.currentRuntimeStateForPipOwner == .connected {
        vc.showConnectedChromeForPipOwner(source: "pip_exit")
      }
    }
    ScreenAwakeBridge.shared.notifyPresentationChanged(callId: sid, presentation: "fullscreen")
    DibayCallPipPlugin.publishPipModeChanged(inPipMode: false, callId: sid)
    // PiP closed without restore while app-usable: do not resurrect fullscreen VC.
    if fullscreenReleasedForPip, fullscreenController == nil {
      uiPresentationState = .pipActiveAppUsable
      NativeVideoCallLog.info("native_video_pip_stopped_without_restore", callId: sid)
    }
    NativeVideoCallLog.info("native_video_pip_exited", callId: sid)
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
  ) {
    guard let sid = boundCallId else {
      completionHandler(false)
      return
    }
    clearFrameBridge(reason: "pip_restore")
    DibayCallPipPlugin.publishPipAction(action: "restore", callId: sid)
    restoreCompletion = completionHandler
    NativeVideoCallUiHost.restoreFullscreenFromPip(callId: sid) { [weak self] ok in
      guard let self else {
        completionHandler(false)
        return
      }
      if ok {
        self.fullscreenReleasedForPip = false
        self.uiPresentationState = .fullscreenRestored
        if let vc = self.fullscreenController {
          vc.reparentRemoteViewToFullscreenForPipOwner()
          vc.applyPipUiMode(false)
          if vc.currentRuntimeStateForPipOwner == .connected {
            vc.showConnectedChromeForPipOwner(source: "pip_restore")
          }
        }
        NativeVideoCallLog.info("native_video_pip_restore", callId: sid)
      }
      let pending = self.restoreCompletion
      self.restoreCompletion = nil
      pending?(ok)
    }
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: Error
  ) {
    clearFrameBridge(reason: "pip_enter_failed")
    // Keep fullscreen — do not release WebView path on failure.
    fullscreenReleasedForPip = false
    uiPresentationState = .fullscreen
    NativeVideoCallLog.warn(
      "native_video_pip_enter_failed",
      callId: boundCallId ?? "unknown",
      details: "err=\(error.localizedDescription)"
    )
  }

  // MARK: - Private

  private func teardownSession(reason: String, stopPip: Bool) {
    let sid = boundCallId
    if stopPip, pipController?.isPictureInPictureActive == true {
      pipController?.stopPictureInPicture()
    }
    pipController?.delegate = nil
    pipController = nil
    contentSource = nil
    pipContentViewController = nil
    sourceAnchorView = nil
    remoteRenderView = nil
    clearFrameBridge(reason: reason)
    boundCallId = nil
    fullscreenReleasedForPip = false
    uiPresentationState = .fullscreen
    fullscreenController = nil
    restoreCompletion = nil
    if let sid {
      NativeVideoCallLog.info("native_video_pip_owner_teardown", callId: sid, details: "reason=\(reason)")
    }
  }
}
