import Capacitor
import UIKit

/**
 * Static bridge between Runtime and `NativeVoiceCallViewController` (Android Activity parity).
 * Render-only — no session ownership. Incoming voice UI only.
 */
enum NativeVoiceCallUiHost {
  private static let sync = NSLock()
  private static weak var activeController: NativeVoiceCallViewController?
  private static let presentedControllers = NSHashTable<NativeVoiceCallViewController>.weakObjects()
  private static var unlockObserverRegistered = false
  private static var lifecycleObserverRegistered = false
  private static var deferredCallId: String?

  static func canPresentVoiceSurfaces() -> Bool {
    UIApplication.shared.isProtectedDataAvailable
  }

  static func handleRuntimeSnapshot(_ snapshot: NativeVoiceCallRuntimeSnapshot) {
    DispatchQueue.main.async {
      guard let session = snapshot.session else {
        if isTerminalPhase(snapshot.phase) {
          finishIfActiveAny()
        }
        return
      }
      guard session.direction == .incoming else { return }
      let callId = session.sessionId
      switch snapshot.phase {
      case .incomingPresented:
        return
      case .accepting, .accepted, .tokenPending, .joining, .connected:
        ensurePresented(callId: callId, session: session)
        renderState(callId: callId, snapshot: snapshot)
      case .ending:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId)
      case .rejecting, .ended, .failed, .idle:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId)
      case .outgoingStarting:
        return
      }
    }
  }

  static func ensurePresented(
    callId: String,
    session: NativeVoiceCallSession,
    bypassLockCheck: Bool = false
  ) {
    guard session.direction == .incoming else { return }
    guard Thread.isMainThread else {
      DispatchQueue.main.async {
        ensurePresented(callId: callId, session: session, bypassLockCheck: bypassLockCheck)
      }
      return
    }
    if isShowing(callId: callId) {
      renderState(callId: callId, snapshot: NativeVoiceCallRuntime.shared.snapshot())
      return
    }
    dismissStaleControllers(exceptCallId: callId)
    if !bypassLockCheck && !canPresentVoiceSurfaces() {
      deferredCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      ensureUnlockObserver()
      DibayCallLog.info("ios_native_voice_ui_deferred_locked", sessionId: callId)
      return
    }
    guard let presenter = topPresenter() else {
      if !bypassLockCheck {
        deferredCallId = callId.trimmingCharacters(in: .whitespacesAndNewlines)
        ensureUnlockObserver()
        ensureLifecycleObserver()
        schedulePresenterRetry(callId: callId, session: session)
        DibayCallLog.info("ios_native_voice_ui_deferred_locked", sessionId: callId, detail: "reason=no_presenter")
      }
      return
    }
    deferredCallId = nil
    let controller = NativeVoiceCallViewController(callId: callId, session: session)
    sync.lock()
    activeController = controller
    presentedControllers.add(controller)
    sync.unlock()
    controller.modalPresentationStyle = .fullScreen
    presenter.present(controller, animated: true)
    DibayCallLog.info("ios_native_voice_ui_present", sessionId: callId)
  }

  static func renderState(callId: String, snapshot: NativeVoiceCallRuntimeSnapshot) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { renderState(callId: callId, snapshot: snapshot) }
      return
    }
    for controller in controllers(for: callId) {
      controller.applySnapshot(snapshot)
    }
  }

  static func finishIfActive(callId: String) {
    onMain {
      clearDeferredPresentation(callId: callId)
      let targets = controllers(for: callId)
      guard !targets.isEmpty else { return }
      for controller in targets {
        dismissController(controller, sessionId: callId)
      }
    }
  }

  static func isShowing(callId: String) -> Bool {
    !controllers(for: callId).isEmpty
  }

  private static func finishIfActiveAny() {
    let callIds = Set(presentedControllers.allObjects.map(\.boundCallId))
    for callId in callIds {
      finishIfActive(callId: callId)
    }
  }

  private static func isTerminalPhase(_ phase: NativeVoiceCallPhase) -> Bool {
    switch phase {
    case .ended, .ending, .failed, .rejecting, .idle:
      return true
    default:
      return false
    }
  }

  private static func clearDeferredPresentation(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    if deferredCallId == sid {
      deferredCallId = nil
    }
  }

  private static func dismissStaleControllers(exceptCallId: String) {
    let sid = exceptCallId.trimmingCharacters(in: .whitespacesAndNewlines)
    let stale = presentedControllers.allObjects.filter {
      $0.boundCallId != sid && $0.presentingViewController != nil
    }
    for controller in stale {
      dismissController(controller, sessionId: controller.boundCallId)
    }
  }

  private static func dismissController(_ controller: NativeVoiceCallViewController, sessionId: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    sync.lock()
    presentedControllers.remove(controller)
    sync.unlock()

    guard controller.presentingViewController != nil else {
      sync.lock()
      if activeController === controller {
        activeController = nil
      }
      sync.unlock()
      return
    }

    DibayCallLog.info("ios_native_voice_ui_dismiss", sessionId: sid)
    controller.dismiss(animated: true) {
      sync.lock()
      if activeController === controller {
        activeController = nil
      }
      presentedControllers.remove(controller)
      sync.unlock()
    }
  }

  private static func controllers(for callId: String) -> [NativeVoiceCallViewController] {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    return presentedControllers.allObjects.filter { $0.boundCallId == sid }
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

  private static func ensureLifecycleObserver() {
    guard !lifecycleObserverRegistered else { return }
    lifecycleObserverRegistered = true
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { _ in
      flushDeferredPresentationAfterUnlock()
    }
  }

  private static func schedulePresenterRetry(callId: String, session: NativeVoiceCallSession) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    DispatchQueue.main.async {
      guard deferredCallId == sid else { return }
      ensurePresented(callId: sid, session: session, bypassLockCheck: false)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
      guard deferredCallId == sid else { return }
      DibayCallLog.info("ios_native_voice_ui_flush_after_presenter_retry", sessionId: sid)
      ensurePresented(callId: sid, session: session, bypassLockCheck: true)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
      guard deferredCallId == sid else { return }
      DibayCallLog.info("ios_native_voice_ui_flush_after_presenter_retry", sessionId: sid, detail: "attempt=2")
      ensurePresented(callId: sid, session: session, bypassLockCheck: true)
    }
  }

  private static func flushDeferredPresentationAfterUnlock() {
    guard canPresentVoiceSurfaces() else { return }
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    guard let session = snap.session, session.direction == .incoming else {
      deferredCallId = nil
      return
    }
    let callId = session.sessionId
    switch snap.phase {
    case .accepting, .accepted, .tokenPending, .joining, .connected:
      DibayCallLog.info("ios_native_voice_ui_flush_after_unlock", sessionId: callId)
      ensurePresented(callId: callId, session: session, bypassLockCheck: true)
      renderState(callId: callId, snapshot: snap)
    default:
      deferredCallId = nil
    }
  }

  private static func topPresenter() -> UIViewController? {
    guard let root = resolveRootViewController() else { return nil }
    var top = root
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }

  /// Capacitor iOS — `isKeyWindow` is often false on foreground scenes; fall back before giving up.
  private static func resolveKeyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes
      .filter {
        $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive
      }
      .flatMap(\.windows)
    if let key = windows.first(where: { $0.isKeyWindow }) {
      return key
    }
    if let visible = windows.first(where: { !$0.isHidden && $0.alpha > 0 && $0.windowLevel == .normal }) {
      return visible
    }
    return scenes.flatMap(\.windows).first(where: { !$0.isHidden && $0.alpha > 0 })
  }

  private static func resolveRootViewController() -> UIViewController? {
    if let window = resolveKeyWindow(), let root = window.rootViewController {
      return root
    }
    for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
      for window in scene.windows where !window.isHidden {
        if let bridge = window.rootViewController as? CAPBridgeViewController {
          return bridge
        }
        if let root = window.rootViewController {
          return root
        }
      }
    }
    return nil
  }

  private static func onMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }
}
