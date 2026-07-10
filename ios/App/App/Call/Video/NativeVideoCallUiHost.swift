import UIKit

/**
 * Static bridge between Runtime/Agora and `NativeVideoCallViewController` (Android Activity parity).
 * Render-only — no session ownership.
 */
enum NativeVideoCallUiHost {
  private static let sync = NSLock()
  private static weak var activeController: NativeVideoCallViewController?

  static func handleRuntimeSnapshot(_ snapshot: NativeVideoCallRuntimeSnapshot) {
    guard let session = snapshot.session else { return }
    let callId = session.sessionId
    DispatchQueue.main.async {
      switch snapshot.state {
      case .ended, .failed:
        finishIfActive(callId: callId)
        return
      case .ending:
        renderState(callId: callId, state: snapshot.state)
        return
      case .ringing, .accepting, .connecting:
        ensureIncomingPresented(callId: callId, session: session)
        renderState(callId: callId, state: snapshot.state)
      case .connected:
        renderState(callId: callId, state: snapshot.state)
      }
    }
  }

  static func ensureIncomingPresented(callId: String, session: NativeVideoCallSession) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { ensureIncomingPresented(callId: callId, session: session) }
      return
    }
    if isShowing(callId: callId) {
      renderState(callId: callId, state: NativeVideoCallRuntime.shared.snapshot().state)
      return
    }
    guard let presenter = topPresenter() else { return }
    let controller = NativeVideoCallViewController(callId: callId, session: session)
    sync.lock()
    activeController = controller
    sync.unlock()
    controller.modalPresentationStyle = .fullScreen
    presenter.present(controller, animated: true)
    NativeVideoCallLog.info("incoming_activity_shown", callId: callId)
    NativeVideoCallLog.info("lock_screen_visible", callId: callId)
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
      guard let controller = controller(for: callId) else { return }
      sync.lock()
      if activeController === controller {
        activeController = nil
      }
      sync.unlock()
      controller.dismiss(animated: true)
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
    onMain {
      guard let controller = controller(for: callId) else { return }
      controller.stopPipIfActive()
    }
    return true
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
