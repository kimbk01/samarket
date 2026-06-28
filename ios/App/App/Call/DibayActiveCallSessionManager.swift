import Foundation

/** P4 Active Call Session SSOT — mirrors TS ActiveCallSessionMachine */
final class DibayActiveCallSessionManager {
  static let shared = DibayActiveCallSessionManager()

  private let prefs = UserDefaults.standard
  private let prefsKey = "dibay_active_call_session_v1"

  private(set) var callId: String?
  private(set) var phase: String = "IDLE"
  private(set) var mediaType: String = "voice"
  private(set) var connected: Bool = false
  private var localEndSent = false
  private var remoteEndReceived = false

  private static let forbiddenCleanup: Set<String> = [
    "activity_destroyed", "webview_reload", "notification_dismissed",
    "screen_off", "backgrounded", "unknown", "app_swipe",
  ]

  private init() {
    restorePersisted()
  }

  func bindActiveCall(callId: String, mediaType: String, phase: String = "CONNECTED") {
    self.callId = callId
    self.mediaType = mediaType
    self.phase = phase
    self.connected = phase == "CONNECTED"
    persist()
    if connected {
      NSLog("[DIBAY_CALL] active_call_connected callId=%@ media=%@", callId, mediaType)
    }
  }

  func transitionPhase(_ next: String, source: String) {
    guard phase != next else { return }
    phase = next
    if next == "CONNECTED" { connected = true }
    persist()
    NSLog("[DIBAY_CALL] active_call_phase %@ source=%@", next, source)
  }

  func canCleanup(_ reason: String) -> Bool {
    let r = reason.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if r.isEmpty { return false }
    return !Self.forbiddenCleanup.contains(r)
  }

  func requestCleanup(reason: String) -> Bool {
    guard let sid = callId, !sid.isEmpty else { return false }
    guard canCleanup(reason) else {
      NSLog("[DIBAY_CALL] active_call_cleanup_blocked callId=%@ reason=%@", sid, reason)
      return false
    }
    transitionPhase("LOCAL_ENDING", source: reason)
    NSLog("[DIBAY_CALL] active_call_cleanup callId=%@ reason=%@", sid, reason)
    CallKitProvider.shared.reportCallEnded(uuidString: sid)
    clearSession()
    return true
  }

  func onRemoteEnded(callId: String) {
    if remoteEndReceived { return }
    remoteEndReceived = true
    NSLog("[DIBAY_CALL] ios_remote_ended_received callId=%@", callId)
    transitionPhase("REMOTE_ENDED", source: "remote_ended")
    CallKitProvider.shared.reportCallEnded(uuidString: callId)
    clearSession()
  }

  func onLocalEndNotified(callId: String) {
    if localEndSent { return }
    localEndSent = true
    NSLog("[DIBAY_CALL] ios_local_end_notified_remote callId=%@", callId)
  }

  func onAppBackground() {
    guard connected, let sid = callId else { return }
    transitionPhase("BACKGROUNDED", source: "app_background")
    NSLog("[DIBAY_CALL] ios_call_background_keep_alive callId=%@", sid)
  }

  func onAppForeground() {
    guard let sid = callId else { return }
    NSLog("[DIBAY_CALL] ios_active_call_resume_found callId=%@", sid)
    if connected {
      transitionPhase("REENTERING", source: "app_foreground")
      transitionPhase("CONNECTED", source: "reenter_complete")
    }
  }

  func onScreenLocked() {
    guard connected, let sid = callId else { return }
    transitionPhase("SCREEN_OFF_ACTIVE", source: "screen_lock")
    NSLog("[DIBAY_CALL] ios_call_screen_locked_keep_alive callId=%@", sid)
  }

  func recordHeartbeat(callId: String) {
    guard self.callId == callId else { return }
    persist()
  }

  func snapshot() -> [String: Any] {
    [
      "callId": callId as Any,
      "phase": phase,
      "mediaType": mediaType,
      "connected": connected,
    ]
  }

  func clearSession() {
    let sid = callId
    if let sid, !sid.isEmpty {
      ScreenAwakeBridge.shared.release(callId: sid, reason: "session_clear")
    }
    callId = nil
    phase = "CLEANED"
    mediaType = "voice"
    connected = false
    localEndSent = false
    remoteEndReceived = false
    prefs.removeObject(forKey: prefsKey)
    phase = "IDLE"
  }

  private func persist() {
    guard let sid = callId else { return }
    prefs.set(
      ["callId": sid, "phase": phase, "mediaType": mediaType, "connected": connected, "at": Date().timeIntervalSince1970],
      forKey: prefsKey)
  }

  private func restorePersisted() {
    guard let dict = prefs.dictionary(forKey: prefsKey),
      let sid = dict["callId"] as? String, !sid.isEmpty else { return }
    callId = sid
    phase = dict["phase"] as? String ?? "CONNECTED"
    mediaType = dict["mediaType"] as? String ?? "voice"
    connected = dict["connected"] as? Bool ?? true
  }
}
