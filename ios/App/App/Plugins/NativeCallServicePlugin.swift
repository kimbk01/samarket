import Capacitor
import Foundation

/**
 * iOS stub — lib/call/native/native-call-service.ts contract.
 * CallKit is system SSOT; JS activeCallSession is auxiliary UI state.
 */
@objc(NativeCallServicePlugin)
public class NativeCallServicePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "NativeCallServicePlugin"
  public let jsName = "NativeCallService"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "prepareAccept", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "startCall", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getActiveCallId", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "heartbeat", returnType: CAPPluginReturnPromise),
  ]

  @objc func prepareAccept(_ call: CAPPluginCall) {
    call.resolve(["ok": true])
  }

  @objc func startCall(_ call: CAPPluginCall) {
    call.resolve(["ok": true])
  }

  @objc func endCall(_ call: CAPPluginCall) {
    guard let callId = call.getString("callId")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty
    else {
      call.reject("invalid_call_id")
      return
    }
    CallKitProvider.shared.reportCallEnded(uuidString: callId)
    call.resolve(["ok": true])
  }

  @objc func getActiveCallId(_ call: CAPPluginCall) {
    let active = CallKitProvider.shared.getActiveCallSessionId()
    call.resolve(["callId": active as Any])
  }

  @objc func heartbeat(_ call: CAPPluginCall) {
    call.resolve(["ok": true])
  }
}
