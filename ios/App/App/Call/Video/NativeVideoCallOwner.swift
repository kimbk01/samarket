import Foundation

/**
 * Phase B0 — Native Video single owner skeleton.
 * Ports Android `NativeVideoCallOwner`. Web/V4 may not claim calls owned here.
 */
enum NativeVideoCallOwner {
  private static let lock = NSLock()
  private static var owners: [String: String] = [:]
  private static var terminal: Set<String> = []

  static func claimNative(callId: String, reason: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }

    lock.lock()
    defer { lock.unlock() }

    if terminal.contains(sid) {
      NativeVideoCallLog.warn("duplicate_runtime_blocked", callId: sid, details: "reason=terminal_call_replay")
      return false
    }
    if owners[sid] != nil {
      NativeVideoCallLog.warn("duplicate_runtime_blocked", callId: sid, details: "reason=already_owned_native_video")
      return false
    }
    owners[sid] = "native_video"
    NativeVideoCallLog.info("owner_claimed_native_video", callId: sid, details: "reason=\(safe(reason))")
    return true
  }

  static func isNativeOwned(callId: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    lock.lock()
    defer { lock.unlock() }
    return owners[sid] == "native_video"
  }

  static func release(callId: String, reason: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }

    lock.lock()
    defer { lock.unlock() }

    let prev = owners.removeValue(forKey: sid)
    terminal.insert(sid)
    NativeVideoCallLog.info(
      "owner_released",
      callId: sid,
      details: "owner=\(prev ?? "none") reason=\(safe(reason))"
    )
  }

  private static func safe(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "unknown" : trimmed
  }
}
