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
  /// Per-callId terminal dismiss latch — duplicate terminal events must not re-fire UI.
  private static var terminalDismissCallId: String?
  /**
   * S3 — 사용자가 「줄이기」로 내린 callId (UI 표시 상태만, 통화 세션 권한은 Runtime).
   * 이 callId 는 자동 표시(스냅샷·잠금 해제·재시도)를 하지 않고, 사용자 복귀(통화 바)·종료 때만 해제한다.
   */
  private static var minimizedCallId: String?
  /// 줄이기 dismiss 진행 중 들어온 사용자 복귀 — dismiss 완료 후 1회 실행.
  private static var pendingRestore: (() -> Void)?
  private static var minimizeDismissInFlight = false
  /// S3 — 화면을 다시 만들어도 통화 시간이 이어지도록 callId 별 첫 연결 시각.
  private static var connectedAtByCall: [String: Date] = [:]

  static func canPresentVoiceSurfaces() -> Bool {
    UIApplication.shared.isProtectedDataAvailable
  }

  static func handleRuntimeSnapshot(_ snapshot: NativeVoiceCallRuntimeSnapshot, source: String = "") {
    DispatchQueue.main.async {
      guard let session = snapshot.session else {
        if isTerminalPhase(snapshot.phase) {
          finishIfActiveAny(terminalClass: terminalClass(for: snapshot.phase))
        }
        return
      }
      let callId = session.sessionId
      let direction = session.direction == .outgoing ? "outgoing" : "incoming"
      switch snapshot.phase {
      case .incomingPresented:
        return
      case .outgoingStarting, .accepting, .accepted, .tokenPending, .joining, .connected:
        DibayCallLog.info(
          "ios_native_voice_ui_publish_requested",
          sessionId: callId,
          detail: "direction=\(direction) phase=\(phaseLabel(snapshot.phase)) source=\(source)"
        )
        ensurePresented(callId: callId, session: session)
        renderState(callId: callId, snapshot: snapshot, source: source)
      case .ending:
        // NORMAL: render-only — dismiss/notice owned by .ended / .failed terminal.
        clearDeferredPresentation(callId: callId)
        renderState(callId: callId, snapshot: snapshot, source: source)
      case .rejecting:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId, terminalClass: .peerDeclined)
      case .ended:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId, terminalClass: .normalEnded)
      case .failed(let failure):
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId, terminalClass: NativeCallInAppNotice.classifyVoiceFailure(failure))
      case .idle:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId, terminalClass: .none)
      }
    }
  }

  static func ensurePresented(
    callId: String,
    session: NativeVoiceCallSession,
    bypassLockCheck: Bool = false,
    userRestore: Bool = false
  ) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async {
        ensurePresented(
          callId: callId,
          session: session,
          bypassLockCheck: bypassLockCheck,
          userRestore: userRestore
        )
      }
      return
    }
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    // S3 §13.2 — 우선순위 4(자동 표시)는 사용자가 줄인 통화를 다시 띄우지 않는다.
    if !userRestore, minimizedCallId == sid {
      DibayCallLog.info("ios_native_voice_ui_auto_present_skipped", sessionId: sid, detail: "reason=user_minimized")
      return
    }
    if userRestore {
      if minimizeDismissInFlight {
        // 줄이기 dismiss 가 끝나기 전 — 끝난 뒤 1회 복귀.
        pendingRestore = {
          ensurePresented(callId: sid, session: session, bypassLockCheck: bypassLockCheck, userRestore: true)
        }
        DibayCallLog.info("ios_native_voice_ui_restore_queued", sessionId: sid)
        return
      }
      if minimizedCallId == sid {
        minimizedCallId = nil
        DibayCallLog.info("ios_native_voice_ui_restored_by_user", sessionId: sid)
      }
    }
    if isShowing(callId: callId) {
      DibayCallLog.info(
        "ios_native_voice_ui_duplicate_skipped",
        sessionId: callId,
        detail: "reason=already_presented"
      )
      renderState(callId: callId, snapshot: NativeVoiceCallRuntime.shared.snapshot(), source: "duplicate_present_skip")
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
    clearTerminalDismissLatchIfMatching(callId: callId)
    let controller = NativeVoiceCallViewController(callId: callId, session: session)
    sync.lock()
    activeController = controller
    presentedControllers.add(controller)
    sync.unlock()
    controller.modalPresentationStyle = .fullScreen
    presenter.present(controller, animated: true)
    DibayCallLog.info(
      "ios_native_voice_ui_presented",
      sessionId: callId,
      detail: "direction=\(session.direction == .outgoing ? "outgoing" : "incoming")"
    )
  }

  static func renderState(callId: String, snapshot: NativeVoiceCallRuntimeSnapshot, source: String = "") {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { renderState(callId: callId, snapshot: snapshot, source: source) }
      return
    }
    let controllers = controllers(for: callId)
    guard !controllers.isEmpty else { return }
    for controller in controllers {
      controller.applySnapshot(snapshot)
    }
    let direction = snapshot.session?.direction == .outgoing ? "outgoing" : "incoming"
    DibayCallLog.info(
      "ios_native_voice_ui_snapshot_updated",
      sessionId: callId,
      detail: "direction=\(direction) phase=\(phaseLabel(snapshot.phase)) source=\(source)"
    )
  }

  static func finishIfActive(
    callId: String,
    terminalClass: NativeCallInAppNotice.CallTerminalClass = .none
  ) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      clearDeferredPresentation(callId: sid)
      // S3 §13.2 — 우선순위 1(종료): 줄인 상태·연결 시각을 해제 (화면이 없어도).
      clearMinimizedState(callId: sid)
      sync.lock()
      if terminalDismissCallId == sid {
        sync.unlock()
        DibayCallLog.info(
          "ios_native_voice_finish_duplicate_latched",
          sessionId: sid,
          detail: "class=\(terminalClass.rawValue)"
        )
        return
      }
      sync.unlock()
      let targets = controllers(for: sid)
      guard !targets.isEmpty else { return }
      sync.lock()
      terminalDismissCallId = sid
      sync.unlock()
      let event = NativeCallInAppNotice.noticeEvent(for: terminalClass)
      for controller in targets {
        if let event {
          controller.presentCallInAppNoticeThenDismiss(event: event) {
            dismissController(controller, sessionId: sid)
          }
        } else {
          dismissController(controller, sessionId: sid)
        }
      }
    }
  }

  static func isShowing(callId: String) -> Bool {
    !controllers(for: callId).isEmpty
  }

  /**
   * S3 — 「줄이기」: 통화 화면만 내리고 통화는 유지한다(CallKit·오디오·Agora 는 Runtime 소유, VC 는 렌더만).
   * 앱(메신저)이 보이고 웹 통화 바로 돌아온다. 연결된 통화에서만.
   */
  static func minimizeToApp(callId: String) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      let snap = NativeVoiceCallRuntime.shared.snapshot()
      guard snap.session?.sessionId == sid, case .connected = snap.phase else {
        DibayCallLog.info("ios_native_voice_minimize_blocked", sessionId: sid, detail: "reason=not_connected")
        return
      }
      let targets = controllers(for: sid)
      guard !targets.isEmpty else { return }
      minimizedCallId = sid
      minimizeDismissInFlight = true
      // 화면 참조를 먼저 해제 — 닫히는 동안 「표시 중」으로 오판해 복귀가 무시되지 않게 (영상 releaseFullscreenForPip 와 같은 순서).
      sync.lock()
      for controller in targets {
        presentedControllers.remove(controller)
        if activeController === controller {
          activeController = nil
        }
      }
      sync.unlock()
      DibayCallLog.info("ios_native_voice_minimized", sessionId: sid)
      let group = DispatchGroup()
      for controller in targets where controller.presentingViewController != nil {
        group.enter()
        controller.dismiss(animated: true) { group.leave() }
      }
      group.notify(queue: .main) {
        minimizeDismissInFlight = false
        if let restore = pendingRestore {
          pendingRestore = nil
          restore()
        }
      }
    }
  }

  /// 첫 연결 시각 — 없으면 지금으로 기록. 종료 시 해제.
  static func connectedAt(for callId: String) -> Date {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    sync.lock()
    defer { sync.unlock() }
    if let existing = connectedAtByCall[sid] {
      return existing
    }
    let now = Date()
    connectedAtByCall[sid] = now
    return now
  }

  private static func clearMinimizedState(callId: String?) {
    let sid = callId?.trimmingCharacters(in: .whitespacesAndNewlines)
    sync.lock()
    if let sid {
      connectedAtByCall.removeValue(forKey: sid)
    } else {
      connectedAtByCall.removeAll()
    }
    sync.unlock()
    if sid == nil || minimizedCallId == sid {
      minimizedCallId = nil
      pendingRestore = nil
    }
  }

  private static func finishIfActiveAny(terminalClass: NativeCallInAppNotice.CallTerminalClass) {
    clearMinimizedState(callId: nil)
    let callIds = Set(presentedControllers.allObjects.map(\.boundCallId))
    for callId in callIds {
      finishIfActive(callId: callId, terminalClass: terminalClass)
    }
  }

  private static func terminalClass(for phase: NativeVoiceCallPhase) -> NativeCallInAppNotice.CallTerminalClass {
    switch phase {
    case .failed(let failure):
      return NativeCallInAppNotice.classifyVoiceFailure(failure)
    case .rejecting:
      return .peerDeclined
    case .ending, .ended:
      return .normalEnded
    default:
      return .none
    }
  }

  private static func clearTerminalDismissLatchIfMatching(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    sync.lock()
    if terminalDismissCallId == sid {
      terminalDismissCallId = nil
    }
    sync.unlock()
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

    DibayCallLog.info("ios_native_voice_ui_dismissed", sessionId: sid)
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
    guard let session = snap.session else {
      deferredCallId = nil
      return
    }
    let callId = session.sessionId
    switch snap.phase {
    case .outgoingStarting, .accepting, .accepted, .tokenPending, .joining, .connected:
      DibayCallLog.info("ios_native_voice_ui_flush_after_unlock", sessionId: callId)
      ensurePresented(callId: callId, session: session, bypassLockCheck: true)
      renderState(callId: callId, snapshot: snap, source: "flush_after_unlock")
    default:
      deferredCallId = nil
    }
  }

  private static func phaseLabel(_ phase: NativeVoiceCallPhase) -> String {
    switch phase {
    case .idle: return "idle"
    case .incomingPresented: return "incoming_presented"
    case .outgoingStarting: return "outgoing_starting"
    case .accepting: return "accepting"
    case .accepted: return "accepted"
    case .tokenPending: return "token_pending"
    case .joining: return "joining"
    case .connected: return "connected"
    case .rejecting: return "rejecting"
    case .ending: return "ending"
    case .ended: return "ended"
    case .failed: return "failed"
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
