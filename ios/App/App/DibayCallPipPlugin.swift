import Foundation
import Capacitor

/** iOS P0 stub — AVPictureInPictureController phase 분리. Web Dock fallback only. */
@objc(DibayCallPipPlugin)
public class DibayCallPipPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DibayCallPipPlugin"
    public let jsName = "DibayCallPip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isPipSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enterCallPip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exitCallPip", returnType: CAPPluginReturnPromise),
    ]

    @objc func isPipSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": false])
    }

    @objc func enterCallPip(_ call: CAPPluginCall) {
        call.resolve(["ok": false])
    }

    @objc func exitCallPip(_ call: CAPPluginCall) {
        call.resolve(["ok": false])
    }
}
