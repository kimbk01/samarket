import Foundation
import Capacitor

/** Native video PiP bridge — delegates to `NativeVideoCallPipPresenter` when flag/runtime active. */
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
        call.resolve(["supported": NativeVideoCallPipPresenter.isSupported()])
    }

    @objc func enterCallPip(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        let ok = NativeVideoCallPipPresenter.requestEnter(callId: callId, source: "plugin")
        call.resolve(["ok": ok])
    }

    @objc func exitCallPip(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        let ok = NativeVideoCallPipPresenter.requestExit(callId: callId)
        call.resolve(["ok": ok])
    }
}
