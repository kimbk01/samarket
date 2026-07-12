import UIKit

/**
 * Static bridge between Runtime/Agora and `NativeVideoCallViewController` (Android Activity parity).
 * Render-only — no session ownership.
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
        finishIfActive(callId: callId)
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
    bypassLockCheck: Bool = false
  ) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async {
        ensureIncomingPresented(callId: callId, session: session, bypassLockCheck: bypassLockCheck)
      }
      return
    }
    if isShowing(callId: callId) {
      renderState(callId: callId, state: NativeVideoCallRuntime.shared.snapshot().state)
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
    presenter.present(controller, animated: true)
    if session.initiator {
      NativeVideoCallLog.info("outgoing_activity_shown", callId: callId)
    } else {
      NativeVideoCallLog.info("incoming_activity_shown", callId: callId)
    }
    if bypassLockCheck {
      NativeVideoCallLog.info("native_video_surface_shown_after_unlock", callId: callId)
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
      guard let controller = controller(for: callId) else { return }
      controller.ensureVideoRootForRemoteRender()
      controller.attachRemoteView(view)
      NativeVideoCallLog.info("remote_surface_attached", callId: callId)
    }
  }

  @discardableResult
  static func ensureVideoRootForRemoteRender(callId: String) -> Bool {
    guard Thread.isMainThread else { return false }
    return controller(for: callId)?.ensureVideoRootForRemoteRender() ?? false
  }

  static func clearVideoSurfaces(callId: String) {
    onMain {
      controller(for: callId)?.clearVideoSurfaces()
    }
  }

  static func finishIfActive(callId: String) {
    onMain {
      clearDeferredPresentation(callId: callId)
      guard let controller = controller(for: callId) else { return }
      controller.stopPipIfActive()
      DibayCallPipPlugin.clearPipEmitGuards(callId: callId)
      sync.lock()
      if activeController === controller {
        activeController = nil
      }
      sync.unlock()
      controller.dismiss(animated: true)
    }
  }

  /** Cleanup path — stop PiP on main before surfaces cleared / VC dismissed. Main thread only (no sync). */
  static func stopPipBeforeDismiss(callId: String) {
    guard Thread.isMainThread else {
      assertionFailure("stopPipBeforeDismiss must run on main — batch via cleanup main.async")
      return
    }
    controller(for: callId)?.stopPipIfActive()
  }

  static func publishPipEndActionIfNeeded(callId: String) {
    onMain {
      guard let controller = controller(for: callId), controller.isPictureInPictureActive else { return }
      DibayCallPipPlugin.publishPipAction(action: "end", callId: callId)
    }
  }

  static func isShowing(callId: String) -> Bool {
    sync.lock()
    defer { sync.unlock() }
    guard let active = activeController else { return false }
    return active.boundCallId == callId.trimmingCharacters(in: .whitespacesAndNewlines)
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
    guard let controller = controller(for: callId) else { return false }
    if controller.isPictureInPictureActive {
      controller.stopPipIfActive()
      return true
    }
    return true
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
