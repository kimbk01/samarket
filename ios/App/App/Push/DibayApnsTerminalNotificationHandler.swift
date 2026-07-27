import Capacitor
import Foundation
import UserNotifications

/**
 * Chains in front of Capacitor PushNotificationsHandler.
 * Intercepts terminal APNs in willPresent (foreground) and didReceive (tap) without replacing Capacitor routing.
 */
final class DibayApnsTerminalNotificationHandler: NSObject, NotificationHandlerProtocol {
  static let shared = DibayApnsTerminalNotificationHandler()

  weak var next: NotificationHandlerProtocol?

  func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
    let info = notification.request.content.userInfo
    if CallTerminalDecision.canonicalizeKind(from: info) != nil {
      CallTerminalEventHandler.shared.handleIfTerminal(userInfo: info, source: .apnsForeground)
    }
    return next?.willPresent(notification: notification) ?? []
  }

  func didReceive(response: UNNotificationResponse) {
    let info = response.notification.request.content.userInfo
    if CallTerminalDecision.canonicalizeKind(from: info) != nil {
      // Backup path when remote-fetch did not run; not tap-only authority.
      CallTerminalEventHandler.shared.handleIfTerminal(userInfo: info, source: .apnsTap)
    }
    next?.didReceive(response: response)
  }
}
