import AVFoundation
import CallKit
import Foundation
import UIKit

final class CallKitProvider: NSObject, CXProviderDelegate {
  static let shared = CallKitProvider()

  private let provider: CXProvider
  private var callUuidBySessionId: [String: UUID] = [:]
  private var hasVideoBySessionId: [String: Bool] = [:]

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
    let sessionId = uuidString.trimmingCharacters(in: .whitespacesAndNewlines)
    let uuid = uuidFromSession(sessionId: sessionId)
    callUuidBySessionId[sessionId] = uuid
    hasVideoBySessionId[sessionId] = hasVideo

    // Phase 2 — voice only: register Native Voice Runtime before CallKit presents.
    if !hasVideo {
      let session = NativeVoiceCallSession(
        sessionId: sessionId,
        callUUID: uuid,
        direction: .incoming,
        peerId: nil,
        createdAt: Date()
      )
      do {
        try NativeVoiceCallRuntime.shared.registerIncomingSession(session)
      } catch {
        NSLog(
          "[DIBAY_CALL] ios_native_voice_register_failed sessionId=%@ err=%@",
          maskSessionId(sessionId),
          String(describing: error)
        )
        // Keep existing CallKit presentation policy — still report incoming UI.
      }
    }

    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: handle)
    update.hasVideo = hasVideo
    update.localizedCallerName = handle
    provider.reportNewIncomingCall(with: uuid, update: update, completion: completion)
  }

  func reportCallEnded(uuidString: String) {
    let sid = uuidString.trimmingCharacters(in: .whitespacesAndNewlines)
    // Terminal VoIP / remote cleanup — Native Voice path only when Runtime still owns session.
    let snap = NativeVoiceCallRuntime.shared.snapshot()
    if let active = snap.session, active.sessionId == sid, !(hasVideoBySessionId[sid] ?? false) {
      NativeVoiceIncomingCallCoordinator.shared.handleRemoteTerminal(sessionId: sid)
    }
    guard let uuid = callUuidBySessionId[sid] ?? UUID(uuidString: sid) else { return }
    if !(hasVideoBySessionId[sid] ?? false) {
      NSLog(
        "[DIBAY_CALL] ios_native_voice_callkit_end sessionId=%@ reason=report_call_ended",
        maskSessionId(sid)
      )
    }
    provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
    callUuidBySessionId.removeValue(forKey: sid)
    hasVideoBySessionId.removeValue(forKey: sid)
  }

  /** P4 — outgoing/active CallKit session for connected calls */
  func reportOutgoingCallStarted(sessionId: String, hasVideo: Bool) {
    let uuid = uuidFromSession(sessionId: sessionId)
    callUuidBySessionId[sessionId] = uuid
    let handle = CXHandle(type: .generic, value: sessionId)
    let start = CXStartCallAction(call: uuid, handle: handle)
    start.isVideo = hasVideo
    let transaction = CXTransaction(action: start)
    CXCallController().request(transaction) { error in
      if let error = error {
        NSLog("[DIBAY_CALL] ios_callkit_start_failed callId=%@ err=%@", sessionId, error.localizedDescription)
      }
    }
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

  private func sessionId(for callUUID: UUID) -> String? {
    callUuidBySessionId.first(where: { $0.value == callUUID })?.key
  }

  private func maskSessionId(_ sessionId: String) -> String {
    guard sessionId.count > 8 else { return sessionId }
    return String(sessionId.prefix(4)) + "…" + String(sessionId.suffix(4))
  }

  private func deliverExistingAnswerHandoff(sessionId: String) {
    CallV4SurfaceOwnerBridge.deliver(
      callId: sessionId,
      owner: "accepted_transition",
      reason: "ios_callkit_answer"
    )
    DibayPushTokenBridge.openCallDeepLink(sessionId: sessionId)
  }

  func providerDidReset(_ provider: CXProvider) {
    callUuidBySessionId.removeAll()
    hasVideoBySessionId.removeAll()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    DibayCallAudioSessionController.shared.noteCallKitDidActivate()
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    DibayCallAudioSessionController.shared.noteCallKitDidDeactivate()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard let sessionId = sessionId(for: action.callUUID) else {
      // Preserve prior behavior when mapping is missing: fulfill without handoff.
      action.fulfill()
      return
    }

    let isVideo = hasVideoBySessionId[sessionId] ?? false
    if isVideo {
      // Video Runtime not in Phase V1 — keep legacy WebView-only answer path.
      deliverExistingAnswerHandoff(sessionId: sessionId)
      action.fulfill()
      return
    }

    // Phase iOS-V1 Incoming Voice — Native establishment only (no Web handoff).
    NativeVoiceIncomingCallCoordinator.shared.handleAnswer(sessionId: sessionId) { fulfill in
      DispatchQueue.main.async {
        if fulfill {
          action.fulfill()
        } else {
          action.fail()
        }
      }
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard let sessionId = callUuidBySessionId.first(where: { $0.value == action.callUUID })?.key else {
      action.fulfill()
      return
    }

    let isVideo = hasVideoBySessionId[sessionId] ?? false
    if isVideo {
      CallV4SurfaceOwnerBridge.deliver(
        callId: sessionId,
        owner: "terminal",
        reason: "ios_callkit_end"
      )
      action.fulfill()
      DibayPushTokenBridge.postCallAction(sessionId: sessionId, action: "reject_or_end")
      callUuidBySessionId.removeValue(forKey: sessionId)
      hasVideoBySessionId.removeValue(forKey: sessionId)
      return
    }

    // Voice Native V1 — reject/end via Native coordinator (no Web postCallAction).
    NSLog(
      "[DIBAY_CALL] ios_native_voice_callkit_end sessionId=%@ reason=callkit_end_action",
      maskSessionId(sessionId)
    )
    NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sessionId) {
      DispatchQueue.main.async {
        action.fulfill()
        self.callUuidBySessionId.removeValue(forKey: sessionId)
        self.hasVideoBySessionId.removeValue(forKey: sessionId)
      }
    }
  }
}
