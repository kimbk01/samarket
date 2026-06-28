import UIKit

/**
 * Connected-video screen-awake lease — session-owned idle-timer disable.
 * Does not touch CallKit lock / VoIP push wake paths.
 */
final class ScreenAwakeBridge {
  static let shared = ScreenAwakeBridge()

  private let lock = NSLock()
  private var leasedCallId: String?

  private init() {}

  func acquire(callId: String, reason: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    if Thread.isMainThread {
      acquireOnMain(callId: sid, reason: reason)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.acquireOnMain(callId: sid, reason: reason)
      }
    }
  }

  func release(callId: String?, reason: String) {
    if Thread.isMainThread {
      releaseOnMain(callId: callId, reason: reason)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.releaseOnMain(callId: callId, reason: reason)
      }
    }
  }

  func notifyPresentationChanged(callId: String, presentation: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    if Thread.isMainThread {
      reapplyOnMain(callId: sid, reason: "presentation_\(presentation)")
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.reapplyOnMain(callId: sid, reason: "presentation_\(presentation)")
      }
    }
  }

  func reapplyOnBecomeActive() {
    reapplyOnForeground(source: "reapply_on_resume")
  }

  func reapplyOnEnterForeground() {
    reapplyOnForeground(source: "reapply_on_foreground")
  }

  private func reapplyOnForeground(source: String) {
    lock.lock()
    let active = leasedCallId
    lock.unlock()
    guard let active, !active.isEmpty else { return }
    if Thread.isMainThread {
      reapplyOnMain(callId: active, reason: source)
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.reapplyOnMain(callId: active, reason: source)
      }
    }
  }

  private func acquireOnMain(callId: String, reason: String) {
    lock.lock()
    defer { lock.unlock() }

    let firstLease = leasedCallId == nil
    let sameCall = leasedCallId == callId
    leasedCallId = callId
    if firstLease || !sameCall {
      NSLog(
        "[DIBAY_SCREEN_AWAKE] screen_awake_acquire callId=%@ reason=%@",
        callId,
        reason
      )
    }
    applyIdleTimerDisabled(callId: callId, marker: "apply_current_activity")
  }

  private func releaseOnMain(callId: String?, reason: String) {
    lock.lock()
    defer { lock.unlock() }

    guard let active = leasedCallId else { return }
    if let expected = callId?.trimmingCharacters(in: .whitespacesAndNewlines),
      !expected.isEmpty,
      expected != active
    {
      return
    }
    leasedCallId = nil
    UIApplication.shared.isIdleTimerDisabled = false
    NSLog(
      "[DIBAY_SCREEN_AWAKE] screen_awake_release callId=%@ reason=%@",
      active,
      reason
    )
  }

  private func reapplyOnMain(callId: String, reason: String) {
    lock.lock()
    defer { lock.unlock() }
    guard let active = leasedCallId, !active.isEmpty, active == callId else { return }
    applyIdleTimerDisabled(callId: active, marker: reason)
  }

  private func applyIdleTimerDisabled(callId: String, marker: String) {
    UIApplication.shared.isIdleTimerDisabled = true
    NSLog(
      "[DIBAY_SCREEN_AWAKE] screen_awake_apply_current_activity callId=%@ activity=ios_app marker=%@",
      callId,
      marker
    )
    if marker == "reapply_on_resume"
      || marker == "reapply_on_foreground"
      || marker.hasPrefix("presentation_")
    {
      NSLog(
        "[DIBAY_SCREEN_AWAKE] screen_awake_reapply_on_resume callId=%@ marker=%@",
        callId,
        marker
      )
    }
  }
}
