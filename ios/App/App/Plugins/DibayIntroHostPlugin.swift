import Capacitor
import Foundation

@objc(DibayIntroHostPlugin)
public class DibayIntroHostPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayIntroHostPlugin"
  public let jsName = "DibayIntroHost"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "notifyHomePresentationReady", returnType: CAPPluginReturnPromise),
  ]

  @objc func notifyHomePresentationReady(_ call: CAPPluginCall) {
    let surface = call.getString("surface") ?? "unknown"
    DibayIntroHostOwner.shared.notifyHomePresentationReady(surface: surface)
    call.resolve()
  }
}
