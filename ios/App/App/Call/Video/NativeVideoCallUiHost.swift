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
  /// Per-callId terminal dismiss latch — duplicate terminal events must not re-fire UI.
  private static var terminalDismissCallId: String?
  /**
   * S3 — PiP 없이 「줄이기」로 내린 callId (UI 표시 상태만). PiP 경로는 기존 NativeVideoCallPipOwner 가 맡는다.
   * 이 callId 는 자동 표시하지 않고, 사용자 복귀(통화 바)·종료 때만 해제한다.
   */
  private static var minimizedCallId: String?
  private static var minimizeDismissInFlight = false
  private static var pendingRestore: (() -> Void)?
  /// S3 — 화면을 다시 만들어도 통화 시간이 이어지도록 callId 별 첫 연결 시각.
  private static var connectedAtByCall: [String: Date] = [:]

  /// Device unlocked — custom UI and camera surfaces are allowed (iOS protected-data contract).
  static func canPresentVideoSurfaces() -> Bool {
    UIApplication.shared.isProtectedDataAvailable
  }

  static func handleRuntimeSnapshot(_ snapshot: NativeVideoCallRuntimeSnapshot) {
    guard let session = snapshot.session else { return }
    let callId = session.sessionId
    DispatchQueue.main.async {
      switch snapshot.state {
      case .ended:
        clearDeferredPresentation(callId: callId)
        finishIfActive(callId: callId, terminalClass: .normalEnded)
        return
      case .failed:
        clearDeferredPresentation(callId: callId)
        let cls: NativeCallInAppNotice.CallTerminalClass =
          snapshot.failure.map { NativeCallInAppNotice.classifyVideoFailure($0) } ?? .actionableFailure
        finishIfActive(callId: callId, terminalClass: cls)
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
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    // S3 §13.2 — 우선순위 4(자동 표시)는 사용자가 PiP 없이 줄인 통화를 다시 띄우지 않는다.
    if !forceRestoreFromPip, minimizedCallId == sid {
      NativeVideoCallLog.info("native_video_ui_auto_present_skipped", callId: sid, details: "reason=user_minimized")
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
    clearTerminalDismissLatchIfMatching(callId: callId)
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

  static func finishIfActive(
    callId: String,
    terminalClass: NativeCallInAppNotice.CallTerminalClass = .none
  ) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      clearDeferredPresentation(callId: sid)
      // S3 §13.2 — 우선순위 1(종료): 줄인 상태·연결 시각 해제 (화면이 없어도).
      clearMinimizedState(callId: sid)
      if #available(iOS 15.0, *) {
        // Terminal while PiP / after UI release: stop PiP + drop ContentSource once.
        NativeVideoCallPipOwner.shared.teardownForTerminal(callId: sid)
      }
      sync.lock()
      if terminalDismissCallId == sid {
        sync.unlock()
        NativeVideoCallLog.info(
          "finish_if_active_duplicate_latched",
          callId: sid,
          details: "class=\(terminalClass.rawValue)"
        )
        return
      }
      let active = activeController
      let matches = active?.boundCallId == sid
      guard matches, let controller = active else {
        sync.unlock()
        // Already released for PiP — no fullscreen resurrection. Do not latch (stale id).
        NativeVideoCallLog.info(
          "finish_if_active_no_fullscreen",
          callId: sid,
          details: "class=\(terminalClass.rawValue) pip_owner_teardown=1"
        )
        return
      }
      // Claim latch only when this call's VC is the dismiss target.
      terminalDismissCallId = sid
      sync.unlock()
      let dismissBlock = {
        controller.stopPipIfActive()
        DibayCallPipPlugin.clearPipEmitGuards(callId: sid)
        sync.lock()
        if activeController === controller {
          activeController = nil
        }
        sync.unlock()
        controller.dismiss(animated: true)
      }
      let event = NativeCallInAppNotice.noticeEvent(for: terminalClass)
      if let event {
        controller.presentCallInAppNoticeThenDismiss(event: event, then: dismissBlock)
      } else {
        dismissBlock()
      }
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

  /**
   * S3 — PiP 를 쓸 수 없을 때(미지원·시작 실패) 「줄이기」: 화면만 내리고 통화 유지(Runtime·Agora·CallKit 무관).
   * 기존 releaseFullscreenForPip 와 같은 순서(참조 먼저 해제 → 비애니메이션 dismiss → 로컬 미리보기 래치 해제).
   */
  static func minimizeWithoutPip(callId: String, reason: String) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      guard NativeVideoCallRuntime.shared.snapshot().state == .connected,
            let controller = controller(for: sid)
      else {
        NativeVideoCallLog.info("native_video_minimize_blocked", callId: sid, details: "reason=not_connected_or_no_vc")
        return
      }
      minimizedCallId = sid
      minimizeDismissInFlight = true
      sync.lock()
      if activeController === controller {
        activeController = nil
      }
      sync.unlock()
      controller.dismiss(animated: false) {
        minimizeDismissInFlight = false
        if let restore = pendingRestore {
          pendingRestore = nil
          restore()
        }
      }
      NativeVideoCallAgoraEngine.shared.noteLocalPreviewSurfaceReleased(callId: sid)
      NativeVideoCallLog.info("native_video_minimized_without_pip", callId: sid, details: "reason=\(reason)")
    }
  }

  static func isMinimizedWithoutPip(callId: String) -> Bool {
    minimizedCallId == callId.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /** S3 — 통화 바 탭(사용자 복귀): PiP 없이 줄인 화면을 같은 세션으로 다시 표시. */
  static func restoreFromUserMinimize(callId: String, completion: @escaping (Bool) -> Void) {
    onMain {
      let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
      let snap = NativeVideoCallRuntime.shared.snapshot()
      guard let session = snap.session, session.sessionId == sid, snap.state == .connected else {
        completion(false)
        return
      }
      if minimizeDismissInFlight {
        pendingRestore = { restoreFromUserMinimize(callId: sid, completion: completion) }
        NativeVideoCallLog.info("native_video_ui_restore_queued", callId: sid)
        return
      }
      minimizedCallId = nil
      ensureIncomingPresented(callId: sid, session: session, bypassLockCheck: true)
      attachVideoSurfacesIfNeeded(callId: sid)
      NativeVideoCallLog.info("native_video_ui_restored_by_user", callId: sid)
      completion(isShowing(callId: sid))
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

  private static func clearMinimizedState(callId: String) {
    sync.lock()
    connectedAtByCall.removeValue(forKey: callId)
    sync.unlock()
    if minimizedCallId == callId {
      minimizedCallId = nil
      pendingRestore = nil
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
