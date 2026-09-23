import UIKit

/**
 * Static bridge between Runtime/Agora and `NativeVideoCallViewController` (Android Activity parity).
 * Render-only — no session ownership.
 *
 * CUT-6B: RELEASE_FULLSCREEN_FOR_PIP dismisses presentation without END_CALL.
 * PiP ContentSource lifetime lives in NativeVideoCallPipOwner.
 */
enum NativeVideoCallUiHost {
  private static let sync = NSLock()
  private static weak var activeController: NativeVideoCallViewController?
  private static var unlockObserverRegistered = false
  private static var deferredCallId: String?

  /// Device unlocked — custom UI and camera surfaces are allowed (iOS protected-data contract).
  static func canPresentVideoSurfaces() -> Bool {
    UIApplication.shared.isProtectedDataAvailable
  }

  static func handleRuntimeSnapshot(_ snapshot: NativeVideoCallRuntimeSnapshot) {
    guard let session = snapshot.session else { return }
    let callId = session.sessionId
    DispatchQueue.main.async {
      switch snapshot.state {
      case .ended, .failed:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId, reason: snapshot.state == .failed ? "failed" : "ended")
        return
      case .ending:
        renderState(callId: callId, state: snapshot.state)
        return
      case .ringing:
        // CallKit owns incoming UI — Native fullscreen only after user accepts.
        return
      case .accepting, .connecting, .connected:
        ensureIncomingPresented(callId: callId, session: session)
        renderState(callId: callId, state: snapshot.state)
      }
    }
  }

  static func ensureIncomingPresented(
    callId: String,
    session: NativeVideoCallSession,
    bypassLockCheck: Bool = false,
    forceRestoreFromPip: Bool = false
  ) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async {
        ensureIncomingPresented(
          callId: callId,
          session: session,
          bypassLockCheck: bypassLockCheck,
          forceRestoreFromPip: forceRestoreFromPip
        )
      }
      return
    }
    if isShowing(callId: callId) {
      renderState(callId: callId, state: NativeVideoCallRuntime.shared.snapshot().state)
      return
    }
    // CUT-6B: while PiP owns app-usable path, do not auto-resurrect fullscreen VC.
    if !forceRestoreFromPip,
       #available(iOS 15.0, *),
       NativeVideoCallPipOwner.shared.shouldBlockAutoPresent(callId: callId)
    {
      NativeVideoCallLog.info(
        "native_video_ui_present_suppressed_for_pip",
        callId: callId,
        details: "reason=pip_active_app_usable"
      )
      return
    }
    if !bypassLockCheck && !canPresentVideoSurfaces() {
      deferredCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      ensureUnlockObserver()
      NativeVideoCallLog.info("native_video_ui_deferred_locked", callId: callId)
      return
    }
    guard let presenter = topPresenter() else {
      if !bypassLockCheck {
        deferredCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
        ensureUnlockObserver()
        NativeVideoCallLog.info("native_video_ui_deferred_locked", callId: callId, details: "reason=no_presenter")
      }
      return
    }
    deferredCallId = nil
    let controller = NativeVideoCallViewController(callId: callId, session: session)
    sync.lock()
    activeController = controller
    sync.unlock()
    controller.modalPresentationStyle = .fullScreen
    // CUT-6F: PiP restore must bind PipOwner + surfaces before Apple restore completion.
    // Non-animated present keeps load/configure on the same main turn (no delay hack).
    presenter.present(controller, animated: !forceRestoreFromPip)
    if session.initiator {
      NativeVideoCallLog.info("outgoing_activity_shown", callId: callId)
      NativeVideoCallLog.corr("LATENCY_UI", callId: callId, details: "stage=outgoing_activity_shown")
    } else {
      NativeVideoCallLog.info("incoming_activity_shown", callId: callId)
    }
    if bypassLockCheck {
      NativeVideoCallLog.info("native_video_surface_shown_after_unlock", callId: callId)
    }
    if forceRestoreFromPip {
      NativeVideoCallLog.info("native_video_ui_restored_from_pip", callId: callId)
      controller.loadViewIfNeeded()
      if #available(iOS 15.0, *) {
        controller.prepareSurfacesForPipRestoreFromOwner()
      }
    }
    attachVideoSurfacesIfNeeded(callId: callId)
  }

  static func renderState(callId: String, state: NativeVideoCallRuntimeState) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { renderState(callId: callId, state: state) }
      return
    }
    guard let controller = controller(for: callId) else { return }
    controller.applyState(state)
  }

  static func attachLocalView(callId: String, view: UIView) {
    onMain {
      controller(for: callId)?.attachLocalView(view)
    }
  }

  static func attachRemoteView(callId: String, view: UIView) {
    onMain {
      if let controller = controller(for: callId) {
        controller.ensureVideoRootForRemoteRender()
        controller.attachRemoteView(view)
        NativeVideoCallLog.info("remote_surface_attached", callId: callId)
        return
      }
      if #available(iOS 15.0, *), NativeVideoCallPipOwner.shared.isBound(to: callId) {
        NativeVideoCallPipOwner.shared.attachRemoteViewToPipContent(view)
        NativeVideoCallLog.info("remote_surface_attached", callId: callId, details: "target=pip_owner")
      }
    }
  }

  static func outgoingLocalFirstFrameReady(callId: String, width: Int, height: Int) {
    onMain {
      controller(for: callId)?.outgoingLocalFirstFrameReady(width: width, height: height)
    }
  }

  static func outgoingRemoteUserJoined(callId: String, uid: UInt) {
    onMain {
      controller(for: callId)?.outgoingRemoteUserJoined(uid: uid)
    }
  }

  static func outgoingRemoteFirstFrameReady(callId: String, uid: UInt, width: Int, height: Int) {
    onMain {
      controller(for: callId)?.outgoingRemoteFirstFrameReady(uid: uid, width: width, height: height)
    }
  }

  @discardableResult
  static func ensureVideoRootForRemoteRender(callId: String) -> Bool {
    guard Thread.isMainThread else { return false }
    if let controller = controller(for: callId) {
      return controller.ensureVideoRootForRemoteRender()
    }
    if #available(iOS 15.0, *), NativeVideoCallPipOwner.shared.isBound(to: callId) {
      return NativeVideoCallPipOwner.shared.contentViewControllerForReparent() != nil
    }
    return false
  }

  static func clearVideoSurfaces(callId: String) {
    onMain {
      controller(for: callId)?.clearVideoSurfaces()
    }
  }

  /**
   * CUT-6B — UI-only release after PiP didStart.
   * MUST NOT call finishIfActive / hangup / Agora leave / CallKit end / Runtime cleanup.
   */
  static func releaseFullscreenForPip(callId: String) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      guard let controller = controller(for: sid) else {
        NativeVideoCallLog.info(
          "release_fullscreen_for_pip_skip",
          callId: sid,
          details: "reason=no_fullscreen_vc"
        )
        return
      }
      sync.lock()
      if activeController === controller {
        activeController = nil
      }
      sync.unlock()
      // Explicit semantic: RELEASE_FULLSCREEN_FOR_PIP ≠ END_CALL.
      // Do not stopPip / finishIfActive / terminal here.
      controller.dismiss(animated: false)
      // Local UIView left with dismissed VC — latch must clear so restore can rebind canvas.
      NativeVideoCallAgoraEngine.shared.noteLocalPreviewSurfaceReleased(callId: sid)
      NativeVideoCallLog.info(
        "release_fullscreen_for_pip_dismissed",
        callId: sid,
        details: "terminal=0 animated=false"
      )
    }
  }

  /** Restore fullscreen from existing Runtime session — no new Agora join / no new callId. */
  static func restoreFullscreenFromPip(callId: String, completion: @escaping (Bool) -> Void) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      let snap = NativeVideoCallRuntime.shared.snapshot()
      guard let session = snap.session,
            session.sessionId == sid
      else {
        NativeVideoCallLog.warn(
          "native_video_pip_restore_failed",
          callId: sid,
          details: "reason=no_active_runtime_session"
        )
        completion(false)
        return
      }
      switch snap.state {
      case .ending, .ended, .failed:
        NativeVideoCallLog.warn(
          "native_video_pip_restore_failed",
          callId: sid,
          details: "reason=terminal_state state=\(snap.state)"
        )
        completion(false)
        return
      case .ringing, .accepting, .connecting, .connected:
        break
      }
      if !isShowing(callId: sid) {
        ensureIncomingPresented(
          callId: sid,
          session: session,
          bypassLockCheck: true,
          forceRestoreFromPip: true
        )
      } else if #available(iOS 15.0, *) {
        controller(for: sid)?.prepareSurfacesForPipRestoreFromOwner()
        attachVideoSurfacesIfNeeded(callId: sid)
      }
      // CUT-6F: Apple restore completion only after PipOwner restore-ready (no next-runloop delay).
      var ready = isShowing(callId: sid)
      if #available(iOS 15.0, *), ready {
        ready = NativeVideoCallPipOwner.shared.applyRestoreReadyTransaction(callId: sid)
      }
      completion(ready)
    }
  }

  static func finishIfActive(callId: String, reason: String? = nil) {
    onMain {
      clearDeferredPresentation(callId: callId)
      if #available(iOS 15.0, *) {
        // Terminal while PiP / after UI release: stop PiP + drop ContentSource once.
        NativeVideoCallPipOwner.shared.teardownForTerminal(callId: callId)
      }
      guard let controller = controller(for: callId) else {
        // Already released for PiP — no fullscreen resurrection.
        NativeVideoCallLog.info(
          "finish_if_active_no_fullscreen",
          callId: callId,
          details: "reason=\(reason ?? "nil") pip_owner_teardown=1"
        )
        return
      }
      let dismissBlock = {
        controller.stopPipIfActive()
        DibayCallPipPlugin.clearPipEmitGuards(callId: callId)
        sync.lock()
        if activeController === controller {
          activeController = nil
        }
        sync.unlock()
        controller.dismiss(animated: true)
      }
      if let event = NativeCallInAppNotice.mapTerminalReason(reason) {
        controller.presentCallInAppNoticeThenDismiss(event: event, then: dismissBlock)
      } else {
        dismissBlock()
      }
    }
  }

  /** Cleanup path — stop PiP on main before surfaces cleared / VC dismissed. Main thread only (no sync). */
  static func stopPipBeforeDismiss(callId: String) {
    guard Thread.isMainThread else {
      assertionFailure("stopPipBeforeDismiss must run on main — batch via cleanup main.async")
      return
    }
    if let controller = controller(for: callId) {
      controller.stopPipIfActive()
      return
    }
    if #available(iOS 15.0, *) {
      NativeVideoCallPipOwner.shared.stopIfActive()
    }
  }

  static func publishPipEndActionIfNeeded(callId: String) {
    onMain {
      if let controller = controller(for: callId), controller.isPictureInPictureActive {
        DibayCallPipPlugin.publishPipAction(action: "end", callId: callId)
        return
      }
      if #available(iOS 15.0, *),
         NativeVideoCallPipOwner.shared.isBound(to: callId),
         NativeVideoCallPipOwner.shared.isPictureInPictureActive
      {
        DibayCallPipPlugin.publishPipAction(action: "end", callId: callId)
      }
    }
  }

  static func isShowing(callId: String) -> Bool {
    sync.lock()
    defer { sync.unlock() }
    guard let active = activeController else { return false }
    return active.boundCallId == callId.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /** Fullscreen OR PipOwner holding an active PiP media path for this call. */
  static func isUiOrPipActive(callId: String) -> Bool {
    if isShowing(callId: callId) { return true }
    if #available(iOS 15.0, *) {
      return NativeVideoCallPipOwner.shared.isBound(to: callId)
    }
    return false
  }

  static func requestPip(callId: String, source: String) -> Bool {
    guard Thread.isMainThread else {
      var ok = false
      DispatchQueue.main.sync {
        ok = requestPip(callId: callId, source: source)
      }
      return ok
    }
    return controller(for: callId)?.tryEnterPip(source: source) ?? false
  }

  static func requestExitPip(callId: String) -> Bool {
    if Thread.isMainThread {
      return requestExitPipOnMain(callId: callId)
    }
    var ok = false
    DispatchQueue.main.sync {
      ok = requestExitPipOnMain(callId: callId)
    }
    return ok
  }

  private static func requestExitPipOnMain(callId: String) -> Bool {
    if let controller = controller(for: callId) {
      if controller.isPictureInPictureActive {
        controller.stopPipIfActive()
        return true
      }
      return true
    }
    if #available(iOS 15.0, *), NativeVideoCallPipOwner.shared.isBound(to: callId) {
      NativeVideoCallPipOwner.shared.stopIfActive()
      return true
    }
    return false
  }

  private static func attachVideoSurfacesIfNeeded(callId: String) {
    NativeVideoCallAgoraEngine.shared.attachLocalPreviewIfUiReady(callId: callId)
    _ = ensureVideoRootForRemoteRender(callId: callId)
    NativeVideoCallAgoraEngine.shared.onRemoteRenderSurfaceReady(callId: callId)
  }

  private static func clearDeferredPresentation(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    if deferredCallId == sid {
      deferredCallId = nil
    }
  }

  private static func ensureUnlockObserver() {
    guard !unlockObserverRegistered else { return }
    unlockObserverRegistered = true
    NotificationCenter.default.addObserver(
      forName: UIApplication.protectedDataDidBecomeAvailableNotification,
      object: nil,
      queue: .main
    ) { _ in
      flushDeferredPresentationAfterUnlock()
    }
  }

  private static func flushDeferredPresentationAfterUnlock() {
    guard canPresentVideoSurfaces() else { return }
    let snap = NativeVideoCallRuntime.shared.snapshot()
    guard let session = snap.session else {
      deferredCallId = nil
      return
    }
    let callId = session.sessionId
    switch snap.state {
    case .accepting, .connecting, .connected:
      NativeVideoCallLog.info("device_unlocked_video_ui_flush", callId: callId, details: "state=\(snap.state)")
      ensureIncomingPresented(callId: callId, session: session, bypassLockCheck: true)
      renderState(callId: callId, state: snap.state)
    default:
      deferredCallId = nil
    }
  }

  private static func controller(for callId: String) -> NativeVideoCallViewController? {
    sync.lock()
    defer { sync.unlock() }
    guard let active = activeController else { return nil }
    return active.boundCallId == callId.trimmingCharacters(in: .whitespacesAndNewlines) ? active : nil
  }

  private static func topPresenter() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let keyWindow = scenes.flatMap(\.windows).first { $0.isKeyWindow }
    guard var top = keyWindow?.rootViewController else { return nil }
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }

  private static func onMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }
}
