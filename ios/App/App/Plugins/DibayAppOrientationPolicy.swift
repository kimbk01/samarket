import UIKit

/**
 * FD3 application-shell orientation.
 * Consumes FD1 DeviceClass. Does not invent width rules.
 * Call presentation view controllers are not this owner.
 */
enum DibayAppOrientationPolicy {
  static func supportedInterfaceOrientations(deviceClass: String) -> UIInterfaceOrientationMask {
    switch deviceClass {
    case "PHONE_IOS":
      return .portrait
    case "TABLET_IPAD":
      return [.portrait, .portraitUpsideDown, .landscapeLeft, .landscapeRight]
    default:
      return .all
    }
  }

  static func shouldAutorotate(deviceClass: String) -> Bool {
    deviceClass != "PHONE_IOS"
  }
}
