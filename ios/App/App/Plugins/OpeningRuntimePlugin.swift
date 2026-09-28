import Capacitor
import Foundation

@objc(OpeningRuntimePlugin)
public class OpeningRuntimePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "OpeningRuntimePlugin"
  public let jsName = "OpeningRuntime"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "preparePack", returnType: CAPPluginReturnPromise),
  ]

  @objc func preparePack(_ call: CAPPluginCall) {
    let options = call.options ?? [:]
    DispatchQueue.global(qos: .utility).async {
      var manifest: [String: Any] = options
      if JSONSerialization.isValidJSONObject(options),
         let data = try? JSONSerialization.data(withJSONObject: options),
         let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      {
        manifest = json
      }
      let installed = OpeningPackStore.install(manifest: manifest)
      let ready = installed && OpeningPackStore.isReady()
      DispatchQueue.main.async {
        call.resolve(["ok": installed, "ready": ready])
      }
    }
  }
}
