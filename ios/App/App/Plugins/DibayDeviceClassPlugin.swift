import Capacitor
import Foundation
import UIKit

/**
 * FD1 DeviceClass authority — iOS.
 * Form-factor authority: UIDevice.current.userInterfaceIdiom only (.phone / .pad).
 * CAPBridgedPlugin — must stay in App-target packageClassList
 * (see patch-ios-capacitor-package-class-list.mjs IOS_DEVICE_PACKAGE_CLASSES).
 */
@objc(DibayDeviceClassPlugin)
public class DibayDeviceClassPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayDeviceClassPlugin"
  public let jsName = "DibayDeviceClass"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getDeviceClass", returnType: CAPPluginReturnPromise),
  ]

  @objc func getDeviceClass(_ call: CAPPluginCall) {
    switch UIDevice.current.userInterfaceIdiom {
    case .phone:
      call.resolve([
        "deviceClass": "PHONE_IOS",
        "source": "userInterfaceIdiom",
      ])
    case .pad:
      call.resolve([
        "deviceClass": "TABLET_IPAD",
        "source": "userInterfaceIdiom",
      ])
    default:
      call.resolve([
        "deviceClass": "UNKNOWN",
        "source": "unsupported_idiom",
        "reason": "unsupported_idiom",
      ])
    }
  }
}
