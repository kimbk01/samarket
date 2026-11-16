import UIKit

/**
 * 통화 중 자동 잠금 해제 — 단일 정의 docs/audit/call-screen-awake-audit-2026-11-16.md §4-1·§4-3.
 *
 * 요청자 둘을 참조 계수로 합친다 (Telegram AppDelegate pushIdleTimerExtension 과 같은 방식):
 *  - 통화 화면 표면(S1): 음성·영상 통화 화면이 보이는 동안 (`pushSurface` / `popSurface`, viewDidAppear·viewDidDisappear)
 *  - 연결 영상 lease(S2): 연결된 영상이 PiP·Dock 으로 줄어도 유지 (`acquire` / `release`)
 * 하나라도 있으면 `isIdleTimerDisabled = true`, 모두 없으면 false. 한쪽 해제가 다른 쪽을 끄지 않는다.
 * Does not touch CallKit lock / VoIP push wake paths.
 */
final class ScreenAwakeBridge {
  static let shared = ScreenAwakeBridge()

  private let lock = NSLock()
  private var leasedCallId: String?
  /// 지금 보이는 통화 화면 (키 = 화면 인스턴스).
  private var surfaceHolders: [String: String] = [:]

  private init() {}

  /// S1 — 통화 화면이 보이기 시작함 (viewDidAppear). 단계·음성/영상·발신/수신 구분 없음.
  func pushSurface(key: String, callId: String, reason: String) {
    runOnMain { [weak self] in
      guard let self else { return }
      self.lock.lock()
      defer { self.lock.unlock() }
      let isNew = self.surfaceHolders[key] == nil
      self.surfaceHolders[key] = callId
      if isNew {
        NSLog(
          "[DIBAY_SCREEN_AWAKE] call_screen_keep_awake_push callId=%@ reason=%@ holders=%d",
          callId,
          reason,
          self.surfaceHolders.count
        )
      }
      self.applyLocked(marker: "surface_push")
    }
  }

  /// S4 — 통화 화면이 사라짐 (viewDidDisappear).
  func popSurface(key: String, reason: String) {
    runOnMain { [weak self] in
      guard let self else { return }
      self.lock.lock()
      defer { self.lock.unlock() }
      guard let callId = self.surfaceHolders.removeValue(forKey: key) else { return }
      NSLog(
        "[DIBAY_SCREEN_AWAKE] call_screen_keep_awake_pop callId=%@ reason=%@ holders=%d",
        callId,
        reason,
        self.surfaceHolders.count
      )
      self.applyLocked(marker: "surface_pop")
    }
  }

  private func runOnMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  /// lock 보유 상태에서만 호출.
  private func applyLocked(marker: String) {
    let disabled = leasedCallId != nil || !surfaceHolders.isEmpty
    if UIApplication.shared.isIdleTimerDisabled != disabled {
      UIApplication.shared.isIdleTimerDisabled = disabled
      NSLog(
        "[DIBAY_SCREEN_AWAKE] idle_timer_disabled=%@ marker=%@ lease=%@ holders=%d",
        disabled ? "true" : "false",
        marker,
        leasedCallId ?? "none",
        surfaceHolders.count
      )
    }
  }

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
    lock.lock()
    let active = leasedCallId
    let hasSurface = !surfaceHolders.isEmpty
    lock.unlock()
    if hasSurface {
      runOnMain { [weak self] in
        guard let self else { return }
        self.lock.lock()
        defer { self.lock.unlock() }
        self.applyLocked(marker: "reapply_on_resume_surface")
      }
    }
    guard let active, !active.isEmpty else { return }
    if Thread.isMainThread {
      reapplyOnMain(callId: active, reason: "reapply_on_resume")
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.reapplyOnMain(callId: active, reason: "reapply_on_resume")
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
    // 통화 화면이 아직 보이면(S1) 자동 잠금 해제를 유지한다 — lease 만 내려놓는다.
    applyLocked(marker: "lease_release")
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
      "[DIBAY_SCREEN_AWAKE] screen_awake_apply_current_activity callId=%@ marker=%@",
      callId,
      marker
    )
    if marker == "reapply_on_resume" {
      NSLog(
        "[DIBAY_SCREEN_AWAKE] screen_awake_reapply_on_resume callId=%@",
        callId
      )
    }
  }
}
