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
  ]

  @objc func getDeviceClass(_ call: CAPPluginCall) {
    call.resolve(DibayDeviceClassClassifier.classify().asDictionary())
  }
}
