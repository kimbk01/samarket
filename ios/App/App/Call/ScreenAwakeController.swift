import UIKit

/**
 * Video call screen-awake SSOT — disables idle timer during active video call phases.
 * iOS visible owner is always the app shell (WebView / CallKit-connected UI).
 *
 * Does not touch CallKit lock / VoIP push wake paths.
 */
final class ScreenAwakeController {
  static let shared = ScreenAwakeController()

  private let lock = NSLock()
  private var leasedCallId: String?

  private static let holdPhases: Set<String> = [
    "ACCEPTED",
    "JOINING_MEDIA",
    "CONNECTING",
    "CONNECTED",
    "REENTERING",
    "RECONNECTING",
    "BACKGROUNDED",
    "SCREEN_OFF_ACTIVE",
    "PIP_ACTIVE",
  ]

  private init() {}

  func sync(source: String) {
    if Thread.isMainThread {
      syncOnMain(source: source)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.syncOnMain(source: source)
      }
    }
  }

  func releaseAll(callId: String?, source: String) {
    if Thread.isMainThread {
      releaseAllOnMain(callId: callId, source: source)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.releaseAllOnMain(callId: callId, source: source)
      }
    }
  }

  private func syncOnMain(source: String) {
    lock.lock()
    defer { lock.unlock() }

    guard let callId = resolveActiveVideoCallId(), shouldHoldForCall(callId: callId) else {
      releaseLeaseOnMain(source: "\(source):no_active_video")
      return
    }

    let previous = leasedCallId
    UIApplication.shared.isIdleTimerDisabled = true
    leasedCallId = callId
    if previous != callId {
      NSLog(
        "[DIBAY_SCREEN_AWAKE] screen_awake_acquire callId=%@ owner=ios_app source=%@",
        callId,
        source
      )
    }
  }

  private func releaseAllOnMain(callId: String?, source: String) {
    lock.lock()
    defer { lock.unlock() }
    if let expected = callId?.trimmingCharacters(in: .whitespacesAndNewlines),
      !expected.isEmpty,
      leasedCallId != expected
    {
      return
    }
    releaseLeaseOnMain(source: source)
  }

  private func releaseLeaseOnMain(source: String) {
    guard let callId = leasedCallId else { return }
    UIApplication.shared.isIdleTimerDisabled = false
    leasedCallId = nil
    NSLog(
      "[DIBAY_SCREEN_AWAKE] screen_awake_release callId=%@ owner=ios_app source=%@",
      callId,
      source
    )
  }

  private func resolveActiveVideoCallId() -> String? {
    let manager = DibayActiveCallSessionManager.shared
    guard let callId = manager.callId?.trimmingCharacters(in: .whitespacesAndNewlines),
      !callId.isEmpty,
      manager.mediaType.lowercased() == "video"
    else {
      return nil
    }
    return shouldHoldForCall(callId: callId) ? callId : nil
  }

  private func shouldHoldForCall(callId: String) -> Bool {
    let manager = DibayActiveCallSessionManager.shared
    guard manager.callId == callId, manager.mediaType.lowercased() == "video" else { return false }
    return Self.holdPhases.contains(manager.phase) || manager.connected
  }
}
