import CallKit
import Foundation
import UIKit

final class CallKitProvider: NSObject, CXProviderDelegate {
  static let shared = CallKitProvider()

  private let provider: CXProvider
  private var callUuidBySessionId: [String: UUID] = [:]

  private override init() {
    let config = CXProviderConfiguration(localizedName: "DIBAY")
    config.supportsVideo = true
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    if let icon = UIImage(named: "AppIcon") {
      config.iconTemplateImageData = icon.pngData()
    }
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  func reportIncomingCall(uuidString: String, handle: String, hasVideo: Bool, completion: @escaping (Error?) -> Void) {
    let uuid = uuidFromSession(sessionId: uuidString)
    callUuidBySessionId[uuidString] = uuid
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: handle)
    update.hasVideo = hasVideo
    update.localizedCallerName = handle
    provider.reportNewIncomingCall(with: uuid, update: update, completion: completion)
  }

  func reportCallEnded(uuidString: String) {
    guard let uuid = callUuidBySessionId[uuidString] ?? UUID(uuidString: uuidString) else { return }
    provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
    callUuidBySessionId.removeValue(forKey: uuidString)
  }

  /** NativeCallService contract — in-memory CallKit map */
  func getActiveCallSessionId() -> String? {
    callUuidBySessionId.keys.first
  }

  private func uuidFromSession(sessionId: String) -> UUID {
    if let existing = callUuidBySessionId[sessionId] { return existing }
    if let u = UUID(uuidString: sessionId) { return u }
    return UUID()
  }

  func providerDidReset(_ provider: CXProvider) {
    callUuidBySessionId.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    action.fulfill()
    if let sessionId = callUuidBySessionId.first(where: { $0.value == action.callUUID })?.key {
      DibayPushTokenBridge.openCallDeepLink(sessionId: sessionId)
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    action.fulfill()
    if let sessionId = callUuidBySessionId.first(where: { $0.value == action.callUUID })?.key {
      DibayPushTokenBridge.postCallAction(sessionId: sessionId, action: "reject_or_end")
      callUuidBySessionId.removeValue(forKey: sessionId)
    }
  }
}
