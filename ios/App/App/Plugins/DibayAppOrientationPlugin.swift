import Capacitor
import Foundation
import UIKit

/**
 * Admin v4 §2-2 C — web admin shell route mode → root VC orientation mask.
 * Policy lives in DibayAppOrientationPolicy; the mask is applied by DibayRootBridgeViewController.
 *
 * CAPBridgedPlugin — registered natively in DibayRootBridgeViewController.makeAppTargetPlugins().
 */
@objc(DibayAppOrientationPlugin)
public class DibayAppOrientationPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayAppOrientationPlugin"
  public let jsName = "DibayAppOrientation"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "setRouteMode", returnType: CAPPluginReturnPromise),
  ]

  @objc func setRouteMode(_ call: CAPPluginCall) {
    let mode = call.getString("mode") ?? ""
    guard mode == "admin" || mode == "default" else {
      call.reject("invalid_mode")
      return
    }
    let adminRoute = mode == "admin"
    DispatchQueue.main.async { [weak self] in
      guard let root = self?.bridge?.viewController as? DibayRootBridgeViewController else {
        call.reject("root_view_controller_unavailable")
        return
      }
      root.setAdminLandscape(adminRoute)
      call.resolve([
        "mode": mode,
        "adminLandscape": root.adminLandscape,
      ])
    }
  }
}
