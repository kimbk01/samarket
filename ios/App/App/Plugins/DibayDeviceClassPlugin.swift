import Capacitor
import Foundation
import UIKit

/**
 * FD1 DeviceClass authority — iOS plugin surface.
 * Classification lives in DibayDeviceClassClassifier. Do not recopy idiom rules here.
 */
@objc(DibayDeviceClassPlugin)
public class DibayDeviceClassPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayDeviceClassPlugin"
  public let jsName = "DibayDeviceClass"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getDeviceClass", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getApnsEnvironment", returnType: CAPPluginReturnPromise),
  ]

  @objc func getDeviceClass(_ call: CAPPluginCall) {
    call.resolve(DibayDeviceClassClassifier.classify().asDictionary())
  }

  /// PUSH-02 — APNs environment of this binary's device token ("sandbox" | "production").
  /// The server sends to the matching APNs host instead of one global host.
  @objc func getApnsEnvironment(_ call: CAPPluginCall) {
    call.resolve(["apnsEnvironment": DibayApnsEnvironment.resolve()])
  }
}

/// Reads `aps-environment` from the embedded provisioning profile.
/// App Store / TestFlight installs carry no embedded profile → production.
/// Xcode Run (development profile) → "development" → sandbox.
enum DibayApnsEnvironment {
  static func resolve() -> String {
    guard
      let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url),
      let text = String(data: data, encoding: .isoLatin1),
      let start = text.range(of: "<?xml"),
      let end = text.range(of: "</plist>", range: start.lowerBound..<text.endIndex),
      let plistData = String(text[start.lowerBound..<end.upperBound]).data(using: .isoLatin1),
      let plist = try? PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any],
      let entitlements = plist["Entitlements"] as? [String: Any],
      let aps = entitlements["aps-environment"] as? String
    else {
      return "production"
    }
    return aps == "production" ? "production" : "sandbox"
  }
}
