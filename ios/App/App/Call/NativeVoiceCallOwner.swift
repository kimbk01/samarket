import Foundation

/** Per-call owner lock between Native Voice Runtime and Web V4 fallback (Android parity). */
enum NativeVoiceCallOwner {
  private static let lock = NSLock()
  private static var owners: [String: String] = [:]
  private static var terminalCalls: Set<String> = []

  static func claimNative(callId: String, reason: String) -> Bool {
    let sid = normalize(callId)
    guard !sid.isEmpty else { return false }
    lock.lock()
    defer { lock.unlock() }
    if terminalCalls.contains(sid) {
      DibayCallLog.warn("ios_native_voice_duplicate_runtime_blocked", sessionId: sid, detail: "reason=terminal_call_replay")
      return false
    }
    if let prev = owners[sid] {
      DibayCallLog.warn(
        "ios_native_voice_duplicate_runtime_blocked",
        sessionId: sid,
        detail: "existingOwner=\(prev) requested=native_voice reason=\(reason)"
      )
      return false
    }
    owners[sid] = "native_voice"
    DibayCallLog.info("ios_native_voice_owner_claimed", sessionId: sid, detail: "reason=\(reason)")
    return true
  }

  static func isNativeOwned(callId: String) -> Bool {
    let sid = normalize(callId)
    guard !sid.isEmpty else { return false }
    lock.lock()
    defer { lock.unlock() }
    return owners[sid] == "native_voice"
  }

  static func release(callId: String, reason: String) {
    let sid = normalize(callId)
    guard !sid.isEmpty else { return }
    lock.lock()
    defer { lock.unlock() }
    guard let prev = owners.removeValue(forKey: sid) else { return }
    terminalCalls.insert(sid)
    DibayCallLog.info(
      "ios_native_voice_owner_released",
      sessionId: sid,
      detail: "owner=\(prev) reason=\(reason)"
    )
  }

  private static func normalize(_ callId: String) -> String {
    callId.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
