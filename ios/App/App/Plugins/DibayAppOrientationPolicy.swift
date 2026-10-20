import UIKit

/**
 * FD3 application-shell orientation.
 * Consumes FD1 DeviceClass. Does not invent width rules.
 * Call presentation view controllers are not this owner.
 *
 * Admin v4 §2-2 C: when the web admin shell is mounted (adminLandscape) on TABLET_IPAD the mask
 * is `.landscape`. Phones and member routes are unchanged. Split View / Stage Manager ignore the
 * mask — the web guard (layer A) is the final authority.
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

  static func supportedInterfaceOrientations(
    deviceClass: String,
    adminLandscape: Bool
  ) -> UIInterfaceOrientationMask {
    if adminLandscape && deviceClass == "TABLET_IPAD" {
      return .landscape
    }
    return supportedInterfaceOrientations(deviceClass: deviceClass)
  }

  static func shouldAutorotate(deviceClass: String) -> Bool {
    deviceClass != "PHONE_IOS"
  }
}
