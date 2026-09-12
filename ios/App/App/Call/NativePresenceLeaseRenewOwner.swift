import Foundation

/**
 * Session-bound Native presence lease renew (D Hybrid / iOS).
 *
 * WebView-independent. NOT a 10s heartbeat clone.
 * Cadence mirrors lib/call/call-active-presence.ts (SHADOW_LEASE_TTL / 2).
 *
 * Sparse renew is best-effort while CallKit/runtime session is connected.
 * Do NOT claim guaranteed background timer cadence under iOS suspension.
 *
 * Production end authority remains legacy_hb (LEASE CUTOVER: NO).
 */
enum NativePresenceLeaseRenewOwner {
  /// Mirror CALL_PRESENCE_SHADOW_LEASE_TTL_MS
  static let shadowLeaseTtlMs: Int = 300_000
  /// Mirror CALL_PRESENCE_NATIVE_RENEW_INTERVAL_MS
  static let renewIntervalMs: Int = shadowLeaseTtlMs / 2

  typealias RenewCallback = (_ ok: Bool, _ status: Int, _ error: String?) -> Void
  typealias RenewTransport = (_ callId: String, _ completion: @escaping RenewCallback) -> Void
  typealias LiveGate = (_ callId: String) -> Bool

  private static let lock = NSLock()
  private static var activeCallId: String?
  private static var activeGeneration: Int = 0
  private static var generationCounter: Int = 0
  private static var sparseWorkItem: DispatchWorkItem?
  private static var transport: RenewTransport?
  private static var liveGate: LiveGate?
  private static var renewCountForTests: Int = 0
  private static let queue = DispatchQueue(label: "com.dibay.native.presence.renew")

  static func start(callId: String, renewTransport: @escaping RenewTransport, gate: @escaping LiveGate) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let gen: Int
    lock.lock()
    clearPendingLocked()
    generationCounter += 1
    activeGeneration = generationCounter
    gen = activeGeneration
    activeCallId = sid
    transport = renewTransport
    liveGate = gate
    renewCountForTests = 0
    lock.unlock()
    DibayCallLog.info(
      "presence_renew_start",
      sessionId: sid,
      detail: "intervalMs=\(renewIntervalMs)"
    )
    fireRenew(sid: sid, gen: gen, source: "immediate_connected")
  }

  static func stop(callId: String, reason: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    defer { lock.unlock() }
    guard !sid.isEmpty, activeCallId == sid else { return }
    DibayCallLog.info("presence_renew_stop", sessionId: sid, detail: "reason=\(reason)")
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

  static func renewCountForTestsValue() -> Int {
    lock.lock()
    defer { lock.unlock() }
    return renewCountForTests
  }

  static func resetForTests() {
    lock.lock()
    clearPendingLocked()
    generationCounter += 1
    activeGeneration = generationCounter
    activeCallId = nil
    transport = nil
    liveGate = nil
    renewCountForTests = 0
    lock.unlock()
  }

  /// Test helper — run pending sparse renew immediately (does not prove BG cadence).
  static func flushSparseForTests() {
    lock.lock()
    let item = sparseWorkItem
    sparseWorkItem = nil
    lock.unlock()
    item?.cancel()
    item?.perform()
  }

  private static func fireRenew(sid: String, gen: Int, source: String) {
    let t: RenewTransport?
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
      renewCountForTests += 1
      lock.unlock()
      if !ok {
        let err = error ?? ""
        if err == "not_live" || err.contains("not_live") {
          stop(callId: sid, reason: "server_not_live")
          return
        }
        DibayCallLog.info(
          "presence_renew_failed",
          sessionId: sid,
          detail: "err=\(err) source=\(source) status=\(status)"
        )
      } else {
        DibayCallLog.info("presence_renew_ok", sessionId: sid, detail: "source=\(source)")
      }
      scheduleSparse(sid: sid, gen: gen)
    }
  }

  private static func scheduleSparse(sid: String, gen: Int) {
    lock.lock()
    guard activeCallId == sid, gen == activeGeneration else {
      lock.unlock()
      return
    }
    clearPendingLocked()
    let work = DispatchWorkItem {
      fireRenew(sid: sid, gen: gen, source: "sparse_best_effort")
    }
    sparseWorkItem = work
    lock.unlock()
    // Best-effort only — do not claim guaranteed BG execution under CallKit suspension.
    queue.asyncAfter(deadline: .now() + .milliseconds(renewIntervalMs), execute: work)
  }

  private static func clearPendingLocked() {
    sparseWorkItem?.cancel()
    sparseWorkItem = nil
  }
}
