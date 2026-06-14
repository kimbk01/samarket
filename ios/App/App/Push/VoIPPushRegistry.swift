import CallKit
import Foundation
import PushKit
import UIKit

/// VoIP push — CallKit incoming call UI (iOS 13+ requires CallKit with VoIP push).
final class VoIPPushRegistry: NSObject, PKPushRegistryDelegate {
  static let shared = VoIPPushRegistry()

  private var registry: PKPushRegistry?
  private let callProvider = CallKitProvider.shared

  func start() {
    if registry != nil { return }
    let reg = PKPushRegistry(queue: DispatchQueue.main)
    reg.delegate = self
    reg.desiredPushTypes = [.voIP]
    registry = reg
  }

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    DibayPushTokenBridge.postVoipToken(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    DibayPushTokenBridge.postVoipTokenInvalidated()
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    let data = payload.dictionaryPayload
    let sessionId = (data["sessionId"] as? String) ?? (data["session_id"] as? String) ?? UUID().uuidString
    let kind = data["call_push_kind"] as? String
    if kind == "call_canceled" {
      callProvider.reportCallEnded(uuidString: sessionId)
      completion()
      return
    }
    let caller = (data["title"] as? String) ?? "수신 통화"
    let hasVideo = (data["kind"] as? String) == "video"
    callProvider.reportIncomingCall(uuidString: sessionId, handle: caller, hasVideo: hasVideo) { _ in
      completion()
    }
  }
}
