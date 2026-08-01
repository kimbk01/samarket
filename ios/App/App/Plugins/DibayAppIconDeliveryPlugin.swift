import Capacitor
import Foundation
import os.log

/**
 * Capacitor bridge for iOS Delivery Adapter v1.
 * JS passes projected appIconTotal only — no Kernel recalculation.
 *
 * CAPBridgedPlugin — must stay in packageClassList (see patch-ios-capacitor-package-class-list.mjs).
 */
@objc(DibayAppIconDeliveryPlugin)
public class DibayAppIconDeliveryPlugin: CAPPlugin, CAPBridgedPlugin {
  private static let log = OSLog(subsystem: "com.dibay.app", category: "DIBAY_APPICON_DELIVERY")

  public let identifier = "DibayAppIconDeliveryPlugin"
  public let jsName = "DibayAppIconDelivery"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "apply", returnType: CAPPluginReturnPromise),
  ]

  @objc func apply(_ call: CAPPluginCall) {
    guard let count = call.getInt("count") else {
      call.reject("count_required")
      return
    }
    DibayAppIconDeliveryAdapter.apply(appIconTotal: count)
    os_log("plugin_apply total=%{public}d", log: Self.log, type: .info, count)
    call.resolve([
      "ok": true,
      "count": max(0, count),
    ])
  }
}
