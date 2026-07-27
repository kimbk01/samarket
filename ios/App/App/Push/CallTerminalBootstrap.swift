import Capacitor
import Foundation
import UIKit

/**
 * Installs APNs terminal bridge onto Capacitor NotificationRouter without replacing Capacitor ownership.
 * Re-installs on become-active because PushNotificationsPlugin.load() may overwrite the handler.
 */
enum CallTerminalBootstrap {
  private static var observing = false

  static func start() {
    installPushHandlerChain()
    guard !observing else { return }
    observing = true
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { _ in
      installPushHandlerChain()
    }
    // Plugin load often finishes after first frame.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      installPushHandlerChain()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
      installPushHandlerChain()
    }
  }

  static func installPushHandlerChain() {
    guard let bridge = resolveBridge() else { return }
    let router = bridge.notificationRouter
    let wrapper = DibayApnsTerminalNotificationHandler.shared
    if router.pushNotificationHandler === wrapper {
      return
    }
    if let current = router.pushNotificationHandler, current !== wrapper {
      wrapper.next = current
    }
    router.pushNotificationHandler = wrapper
  }

  private static func resolveBridge() -> CAPBridgeProtocol? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    for scene in scenes {
      for window in scene.windows {
        if let root = window.rootViewController as? CAPBridgeViewController {
          return root.bridge
        }
        if let presented = window.rootViewController?.presentedViewController as? CAPBridgeViewController {
          return presented.bridge
        }
      }
    }
    return nil
  }
}
