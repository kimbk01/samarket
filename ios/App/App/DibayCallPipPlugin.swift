import Foundation
import Capacitor

/** Native video PiP bridge — delegates to `NativeVideoCallPipPresenter` when flag/runtime active. */
@objc(DibayCallPipPlugin)
public class DibayCallPipPlugin: CAPPlugin, CAPBridgedPlugin {
    static let eventPipModeChanged = "pipModeChanged"
    static let eventPipAction = "pipAction"

    private static weak var pluginInstance: DibayCallPipPlugin?
    private static var lastPipModeByCallId: [String: Bool] = [:]

    public let identifier = "DibayCallPipPlugin"
    public let jsName = "DibayCallPip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isPipSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enterCallPip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exitCallPip", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        super.load()
        DibayCallPipPlugin.pluginInstance = self
    }

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

    static func publishPipModeChanged(inPipMode: Bool, callId: String) {
        let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sid.isEmpty else { return }
        if lastPipModeByCallId[sid] == inPipMode { return }
        lastPipModeByCallId[sid] = inPipMode

        var payload = JSObject()
        payload["inPipMode"] = inPipMode
        payload["callId"] = sid
        emitPipModeChanged(payload)
    }

    static func publishPipAction(action: String, callId: String) {
        let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sid.isEmpty else { return }
        let normalized = action.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalized == "restore" || normalized == "end" else { return }

        var payload = JSObject()
        payload["action"] = normalized
        payload["callId"] = sid
        emitPipAction(payload)
    }

    static func clearPipEmitGuards(callId: String) {
        let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sid.isEmpty else { return }
        lastPipModeByCallId.removeValue(forKey: sid)
    }

    private static func emitPipModeChanged(_ payload: JSObject) {
        guard let plugin = pluginInstance else { return }
        plugin.notifyListeners(eventPipModeChanged, data: payload)
    }

    private static func emitPipAction(_ payload: JSObject) {
        guard let plugin = pluginInstance else { return }
        plugin.notifyListeners(eventPipAction, data: payload)
    }
}
