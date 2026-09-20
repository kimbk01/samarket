import Foundation

/**
 * Session-bound native active-call heartbeat.
 *
 * Production liveness for native-established calls. Cadence mirrors the web active-call
 * heartbeat and is intentionally separate from the 300s shadow native presence lease.
 */
enum NativeActiveCallHeartbeatOwner {
  /// Mirror lib/call/native/call-heartbeat-watchdog.ts CALL_HEARTBEAT_INTERVAL_MS.
  static let activeHeartbeatIntervalMs: Int = 10_000

  typealias HeartbeatCallback = (_ ok: Bool, _ status: Int, _ error: String?) -> Void
  typealias HeartbeatTransport = (_ callId: String, _ completion: @escaping HeartbeatCallback) -> Void
  typealias LiveGate = (_ callId: String) -> Bool

  private static let lock = NSLock()
  private static var activeCallId: String?
  private static var activeGeneration: Int = 0
  private static var generationCounter: Int = 0
  private static var workItem: DispatchWorkItem?
  private static var transport: HeartbeatTransport?
  private static var liveGate: LiveGate?
  private static var heartbeatCountForTests: Int = 0
  private static let queue = DispatchQueue(label: "com.dibay.native.active-heartbeat")

  static func start(callId: String, heartbeatTransport: @escaping HeartbeatTransport, gate: @escaping LiveGate) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let gen: Int
    lock.lock()
    clearPendingLocked()
    generationCounter += 1
    activeGeneration = generationCounter
    gen = activeGeneration
    activeCallId = sid
    transport = heartbeatTransport
    liveGate = gate
    heartbeatCountForTests = 0
    lock.unlock()
    DibayCallLog.info(
      "active_heartbeat_start",
      sessionId: sid,
      detail: "intervalMs=\(activeHeartbeatIntervalMs)"
    )
    fireHeartbeat(sid: sid, gen: gen, source: "immediate_connected")
  }

  static func stop(callId: String, reason: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    defer { lock.unlock() }
    guard !sid.isEmpty, activeCallId == sid else { return }
    DibayCallLog.info("active_heartbeat_stop", sessionId: sid, detail: "reason=\(reason)")
    clearPendingLocked()
    generationCounter += 1
    activeGeneration = generationCounter
    activeCallId = nil
    transport = nil
    liveGate = nil
  }

  static func isActiveForTests(_ callId: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return activeCallId == callId.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func heartbeatCountForTestsValue() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return heartbeatCountForTests
  }

  static func resetForTests() {
    lock.lock()
    clearPendingLocked()
    generationCounter += 1
    activeGeneration = generationCounter
    activeCallId = nil
    transport = nil
    liveGate = nil
    heartbeatCountForTests = 0
    lock.unlock()
  }

  static func flushForTests() {
    lock.lock()
    let item = workItem
    workItem = nil
    lock.unlock()
    item?.cancel()
    item?.perform()
  }

  private static func fireHeartbeat(sid: String, gen: Int, source: String) {
    let t: HeartbeatTransport?
    let gate: LiveGate?
    lock.lock()
    guard activeCallId == sid, gen == activeGeneration else {
      lock.unlock()
      return
    }
    t = transport
    gate = liveGate
    lock.unlock()
    guard let t, let gate else { return }
    guard gate(sid) else {
      stop(callId: sid, reason: "not_live_gate")
      return
    }
    t(sid) { ok, status, error in
      lock.lock()
      guard activeCallId == sid, gen == activeGeneration else {
        lock.unlock()
        return
      }
      heartbeatCountForTests += 1
      lock.unlock()
      if !ok {
        let err = error ?? ""
        if err == "not_live" || err.contains("not_live") {
          stop(callId: sid, reason: "server_not_live")
          return
        }
        DibayCallLog.info(
          "active_heartbeat_failed",
          sessionId: sid,
          detail: "err=\(err) source=\(source) status=\(status)"
        )
      } else {
        DibayCallLog.info("active_heartbeat_ok", sessionId: sid, detail: "source=\(source)")
      }
      scheduleNext(sid: sid, gen: gen)
    }
  }

  private static func scheduleNext(sid: String, gen: Int) {
    lock.lock()
    guard activeCallId == sid, gen == activeGeneration else {
      lock.unlock()
      return
    }
    clearPendingLocked()
    let work = DispatchWorkItem {
      fireHeartbeat(sid: sid, gen: gen, source: "periodic")
    }
    workItem = work
    lock.unlock()
    queue.asyncAfter(deadline: .now() + .milliseconds(activeHeartbeatIntervalMs), execute: work)
  }

  private static func clearPendingLocked() {
    workItem?.cancel()
    workItem = nil
  }
}
