import Foundation
import UIKit
import UserNotifications
import os.log

/**
 * iOS Delivery Adapter v1.
 *
 * Sole duty: deliver projected `appIconTotal` to SpringBoard via
 * `UNUserNotificationCenter.setBadgeCount` / `applicationIconBadgeNumber`.
 * Does not compute Badge / Bell / RoomUnread.
 *
 * Capawesome Badge UserDefaults key `capacitor.badge` is echo cache only.
 */
enum DibayAppIconDeliveryAdapter {
  private static let log = OSLog(subsystem: "com.dibay.app", category: "DIBAY_APPICON_DELIVERY")
  private static let capBadgeStorageKey = "capacitor.badge"
  private static let lastAppliedKey = "dibay.appIconDelivery.lastApplied"

  /**
   * Gate 3 Step 11 — Cap prefs are NOT App Icon authority.
   * Versionless `capacitor.badge` must never final-publish (resume/cold/warm).
   * Final paint: Web Domain snapshot → syncNativeBadgeCount → apply(appIconTotal:).
   * OS badge remains as-is until versioned absolute echo arrives.
   */
  @discardableResult
  static func applyFromCapBadgeCache() -> Bool {
    os_log(
      "cap_cache_paint_rejected reason=VERSION_REQUIRED_OR_RESUME_FORBIDDEN key=%{public}@",
      log: log,
      type: .info,
      capBadgeStorageKey
    )
    return false
  }

  /// Apply absolute appIconTotal to iOS App Icon (SpringBoard).
  static func apply(appIconTotal: Int) {
    let n = max(0, min(999, appIconTotal))
    DispatchQueue.main.async {
      if #available(iOS 16.0, *) {
        UNUserNotificationCenter.current().setBadgeCount(n) { error in
          if let error = error {
            os_log(
              "setBadgeCount_failed total=%{public}d err=%{public}@",
              log: log,
              type: .error,
              n,
              error.localizedDescription
            )
            UIApplication.shared.applicationIconBadgeNumber = n
          } else {
            os_log("apply setBadgeCount total=%{public}d", log: log, type: .info, n)
          }
          UserDefaults.standard.set(n, forKey: lastAppliedKey)
          // Keep Cap cache aligned so Badge.get ≡ Delivery (echo only).
          UserDefaults.standard.set(n, forKey: capBadgeStorageKey)
        }
      } else {
        UIApplication.shared.applicationIconBadgeNumber = n
        UserDefaults.standard.set(n, forKey: lastAppliedKey)
        UserDefaults.standard.set(n, forKey: capBadgeStorageKey)
        os_log("apply applicationIconBadgeNumber total=%{public}d", log: log, type: .info, n)
      }
    }
  }

  /**
   * APNS `aps.badge` / FCM `badgeCount` is send-time hint only.
   * Launcher authority is server current A+B via NativeBadgeSync → apply(appIconTotal:).
   */
  static func applyFromPushUserInfo(_ userInfo: [AnyHashable: Any]) {
    os_log("apns_fcm_badge_hint_ignored keys=%{public}d", log: log, type: .info, userInfo.count)
  }
}
