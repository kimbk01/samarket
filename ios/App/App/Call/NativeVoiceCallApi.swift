import Foundation
import UIKit
import WebKit
import Capacitor

/**
 * iOS Native Voice HTTP — ports Android `NativeVoiceCallApi` contract.
 * Auth: Cookie header from WKWebView cookie store for Capacitor server.origin (no Authorization header).
 */
enum NativeVoiceCallApi {
  struct TokenConnection: Sendable {
    let appId: String
    let channelName: String
    let uid: String
    let token: String
  }

  typealias PatchCallback = (_ ok: Bool, _ status: Int, _ error: String?) -> Void
  typealias TokenCallback = (_ connection: TokenConnection?, _ error: String?) -> Void

  private static let timeoutSeconds: TimeInterval = 8
  private static let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = timeoutSeconds
    config.timeoutIntervalForResource = timeoutSeconds
    config.httpCookieAcceptPolicy = .never
    config.httpShouldSetCookies = false
    return URLSession(configuration: config)
  }()

  static func acceptAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(callId: callId, action: "accept", completion: completion)
  }

  static func rejectAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(callId: callId, action: "reject", completion: completion)
  }

  static func endAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(callId: callId, action: "end", completion: completion)
  }

  /** CUT7 — local ring timeout proposer only; server CUT2 deadline/CAS remains authority. */
  static func missedAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(callId: callId, action: "missed", completion: completion)
  }

  /**
   * Native presence lease renew — Cookie PATCH heartbeat + nativePresenceCapable=true.
   * WebView-independent. Capability = explicit body flag.
   */
  static func presenceRenewAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(
      callId: callId,
      action: "heartbeat",
      extraBody: ["nativePresenceCapable": true, "heartbeatPurpose": "native_lease"],
      completion: completion
    )
  }

  static func activeHeartbeatAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(
      callId: callId,
      action: "heartbeat",
      extraBody: ["heartbeatPurpose": "active"],
      completion: completion
    )
  }

  private static let mediaConnectedLock = NSLock()
  private static var mediaConnectedReported = Set<String>()

  /**
   * Media evidence — Agora remote uid joined (caller and callee). Fire-and-forget, once per session.
   * Server stamps connected_at (active + null CAS). Does not touch runtime/CallKit state.
   */
  static func reportMediaConnectedOnce(callId: String, remoteUid: UInt) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, remoteUid != 0 else { return }
    mediaConnectedLock.lock()
    let first = mediaConnectedReported.insert(sid).inserted
    mediaConnectedLock.unlock()
    guard first else { return }
    patchAsync(
      callId: sid,
      action: "media_connected",
      extraBody: ["evidence": "remote_user_joined", "remoteUid": String(remoteUid), "platform": "ios"],
      completion: { ok, status, error in
        guard !ok else { return }
        DibayCallLog.infoCall(
          "ios_native_voice_media_connected_patch_failed",
          callId: sid,
          detail: "status=\(status) err=\(error ?? "")"
        )
      }
    )
  }

  static func startCallerJoinAsync(
    callId: String,
    roomId: String,
    peerUserId: String,
    peerName: String,
    mediaType: String
  ) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    NativeVoiceOutgoingCallCoordinator.shared.handleOutgoing(
      callId: sid,
      roomId: roomId,
      peerUserId: peerUserId,
      peerName: peerName,
      mediaType: mediaType
    )
  }

  static func fetchTokenAsync(callId: String, completion: @escaping TokenCallback) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(nil, "invalid_call_id")
      return
    }
    guard let origin = resolveServerOrigin() else {
      completion(nil, "no_server_origin")
      return
    }
    guard let url = URL(string: "\(origin)/api/community-messenger/calls/sessions/\(urlEncode(sid))/token") else {
      completion(nil, "bad_url")
      return
    }

    let once = OnceBox()
    resolveCookieHeader(origin: origin) { cookieHeader in
      var request = URLRequest(url: url, timeoutInterval: timeoutSeconds)
      request.httpMethod = "GET"
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      if let cookieHeader, !cookieHeader.isEmpty {
        request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
      }

      let task = session.dataTask(with: request) { data, response, error in
        if let error {
          once.run { completion(nil, (error as NSError).domain) }
          return
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard let data, !data.isEmpty else {
          once.run { completion(nil, "status=\(status) empty_body") }
          return
        }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          once.run { completion(nil, "json_decode_failed") }
          return
        }
        let okFlag = json["ok"] as? Bool ?? false
        let connectionObj = json["connection"] as? [String: Any]
        if status < 200 || status >= 300 || !okFlag || connectionObj == nil {
          let reason =
            (json["reason"] as? String)
            ?? (json["error"] as? String)
            ?? "token_failed"
          once.run { completion(nil, "status=\(status) reason=\(reason)") }
          return
        }
        let appId = (connectionObj?["appId"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let channelName = (connectionObj?["channelName"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let uid = (connectionObj?["uid"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let token = (connectionObj?["token"] as? String ?? "")
        if appId.isEmpty || channelName.isEmpty || uid.isEmpty {
          once.run { completion(nil, "missing_connection_fields") }
          return
        }
        once.run {
          completion(
            TokenConnection(appId: appId, channelName: channelName, uid: uid, token: token),
            nil
          )
        }
      }
      task.resume()
    }
  }

  struct SessionStatus: Sendable {
    let id: String
    let status: String
  }

  /// - status: nil when the request failed or the body had no session.
  /// - retryAfterSeconds: set only for HTTP 429 (`Retry-After` header).
  typealias SessionStatusCallback = (
    _ status: SessionStatus?, _ httpStatus: Int, _ retryAfterSeconds: TimeInterval?
  ) -> Void

  /**
   * Caller-side session status — same `GET /calls/sessions/{id}` the Web caller poll uses
   * (`native-outgoing-terminal-sync.ts`). WebView-independent (Cookie from WK store only).
   */
  static func fetchSessionStatusAsync(callId: String, completion: @escaping SessionStatusCallback) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(nil, 0, nil)
      return
    }
    guard let origin = resolveServerOrigin() else {
      completion(nil, 0, nil)
      return
    }
    let ts = Int(Date().timeIntervalSince1970 * 1000)
    guard let url = URL(string: "\(origin)/api/community-messenger/calls/sessions/\(urlEncode(sid))?ts=\(ts)") else {
      completion(nil, 0, nil)
      return
    }

    let once = OnceBox()
    resolveCookieHeader(origin: origin) { cookieHeader in
      var request = URLRequest(url: url, timeoutInterval: timeoutSeconds)
      request.httpMethod = "GET"
      request.cachePolicy = .reloadIgnoringLocalCacheData
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
      if let cookieHeader, !cookieHeader.isEmpty {
        request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
      }

      let task = session.dataTask(with: request) { data, response, error in
        if error != nil {
          once.run { completion(nil, 0, nil) }
          return
        }
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        if status == 429 {
          let header = http?.value(forHTTPHeaderField: "Retry-After") ?? ""
          let retryAfter = TimeInterval(header.trimmingCharacters(in: .whitespacesAndNewlines))
          once.run { completion(nil, status, retryAfter) }
          return
        }
        guard status >= 200, status < 300,
          let data,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let sessionObj = json["session"] as? [String: Any]
        else {
          once.run { completion(nil, status, nil) }
          return
        }
        let id = (sessionObj["id"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let sessionStatus = (sessionObj["status"] as? String ?? "")
          .trimmingCharacters(in: .whitespacesAndNewlines)
          .lowercased()
        once.run { completion(SessionStatus(id: id, status: sessionStatus), status, nil) }
      }
      task.resume()
    }
  }

  // MARK: - Private

  private static func patchAsync(callId: String, action: String, completion: @escaping PatchCallback) {
    patchAsync(callId: callId, action: action, extraBody: [:], completion: completion)
  }

  private static func patchAsync(
    callId: String,
    action: String,
    extraBody: [String: Any],
    completion: @escaping PatchCallback
  ) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(false, 0, "invalid_call_id")
      return
    }
    guard let origin = resolveServerOrigin() else {
      completion(false, 0, "no_server_origin")
      return
    }
    guard let url = URL(string: "\(origin)/api/community-messenger/calls/sessions/\(urlEncode(sid))") else {
      completion(false, 0, "bad_url")
      return
    }

      let once = OnceBox()
      resolveCookieHeader(origin: origin) { cookieHeader in
        DibayCanonicalDeviceIdStore.resolve { deviceId in
          var request = URLRequest(url: url, timeoutInterval: timeoutSeconds)
          request.httpMethod = "PATCH"
          request.setValue("application/json", forHTTPHeaderField: "Accept")
          request.setValue("application/json", forHTTPHeaderField: "Content-Type")
          if let cookieHeader, !cookieHeader.isEmpty {
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
          }
          var bodyObj: [String: Any] = ["action": action]
          for (k, v) in extraBody {
            bodyObj[k] = v
          }
          if let deviceId, !deviceId.isEmpty {
            bodyObj["deviceId"] = deviceId
          }
          request.httpBody = try? JSONSerialization.data(withJSONObject: bodyObj)

          let task = session.dataTask(with: request) { data, response, error in
            if let error {
              once.run { completion(false, 0, (error as NSError).domain) }
              return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let ok = status >= 200 && status < 300
            var errMsg: String? = ok ? nil : "status=\(status)"
            if !ok, let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
              if let apiError = json["error"] as? String, !apiError.isEmpty {
                errMsg = apiError
              }
            }
            once.run { completion(ok, status, errMsg) }
          }
          task.resume()
        }
      }
  }

  private static func resolveServerOrigin() -> String? {
    guard let url = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let server = root["server"] as? [String: Any],
      var origin = (server["url"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
      !origin.isEmpty
    else {
      return nil
    }
    while origin.hasSuffix("/") {
      origin.removeLast()
    }
    return origin
  }

  private static func resolveCookieHeader(origin: String, completion: @escaping (String?) -> Void) {
    DispatchQueue.main.async {
      let store = resolveWebViewCookieStore() ?? WKWebsiteDataStore.default().httpCookieStore
      store.getAllCookies { cookies in
        guard let host = URL(string: origin)?.host else {
          completion(nil)
          return
        }
        let matched = cookies.filter { cookie in
          let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
          return host == cookie.domain
            || host.hasSuffix(".\(domain)")
            || host == domain
        }
        if matched.isEmpty {
          completion(nil)
          return
        }
        let header = matched.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
        completion(header)
      }
    }
  }

  private static func resolveWebViewCookieStore() -> WKHTTPCookieStore? {
    guard
      let window = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow }),
      let root = window.rootViewController as? CAPBridgeViewController,
      let webView = root.webView
    else {
      return nil
    }
    return webView.configuration.websiteDataStore.httpCookieStore
  }

  private static func urlEncode(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
  }

  private final class OnceBox {
    private let lock = NSLock()
    private var done = false
    func run(_ block: () -> Void) {
      lock.lock()
      defer { lock.unlock() }
      guard !done else { return }
      done = true
      block()
    }
  }

}

/**
 * iPhone outgoing (voice/video) — native-owned remote terminal detection while ringing.
 *
 * The native call screen detaches the WKWebView from its window, and WebKit then suspends the
 * WebContent process (device log: `view is no longer visible` → `Suspending task`). The Web caller
 * poll (`native-outgoing-terminal-sync.ts`) stops with it, so a reject/cancel arriving after that
 * never reached the native screen (docs/audit/messenger-2026-10-26-ios-caller-remote-terminal-design.md).
 * This watch polls the same session API from the app process, which stays running-active.
 *
 * One outgoing watch at a time. A new `start` or `stop` bumps the generation so late responses
 * from an earlier call are dropped. `onTerminal` runs at most once, on the main queue; the caller
 * must still verify its own runtime is pre-connect for that session before closing anything.
 */
final class NativeOutgoingTerminalWatch {
  static let shared = NativeOutgoingTerminalWatch()

  private static let intervalSeconds: TimeInterval = 1
  private static let maxDurationSeconds: TimeInterval = 35
  private static let defaultRetryAfterSeconds: TimeInterval = 5
  /// Same set as Web `TERMINAL_SESSION_STATUSES`.
  private static let terminalStatuses: Set<String> = [
    "rejected", "cancelled", "canceled", "ended", "missed", "failed",
  ]

  private let lock = NSLock()
  private var generation: UInt64 = 0
  private var activeCallId: String?
  private var startedAt = Date()
  private var onTerminal: ((String) -> Void)?

  private init() {}

  /// iOS 15 deployment target — `NSLock.withLock` is iOS 16+.
  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  func start(callId: String, onTerminal: @escaping (_ status: String) -> Void) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let gen: UInt64 = locked {
      generation &+= 1
      activeCallId = sid
      startedAt = Date()
      self.onTerminal = onTerminal
      return generation
    }
    DibayCallLog.info("ios_native_outgoing_terminal_watch_start", sessionId: sid, detail: "gen=\(gen)")
    schedule(callId: sid, generation: gen, after: Self.intervalSeconds)
  }

  /// Idempotent; ignores a callId that is not the active watch.
  func stop(callId: String, reason: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    let stopped: Bool = locked {
      guard activeCallId == sid else { return false }
      generation &+= 1
      activeCallId = nil
      onTerminal = nil
      return true
    }
    if stopped {
      DibayCallLog.info("ios_native_outgoing_terminal_watch_stop", sessionId: sid, detail: "reason=\(reason)")
    }
  }

  private func isCurrent(callId: String, generation gen: UInt64) -> Bool {
    locked { activeCallId == callId && generation == gen }
  }

  private func schedule(callId: String, generation gen: UInt64, after delay: TimeInterval) {
    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
      self?.tick(callId: callId, generation: gen)
    }
  }

  private func tick(callId sid: String, generation gen: UInt64) {
    guard isCurrent(callId: sid, generation: gen) else { return }
    let elapsed = locked { Date().timeIntervalSince(startedAt) }
    if elapsed > Self.maxDurationSeconds {
      stop(callId: sid, reason: "max_duration")
      return
    }
    NativeVoiceCallApi.fetchSessionStatusAsync(callId: sid) { [weak self] status, httpStatus, retryAfter in
      DispatchQueue.main.async {
        self?.handle(callId: sid, generation: gen, status: status, httpStatus: httpStatus, retryAfter: retryAfter)
      }
    }
  }

  private func handle(
    callId sid: String,
    generation gen: UInt64,
    status: NativeVoiceCallApi.SessionStatus?,
    httpStatus: Int,
    retryAfter: TimeInterval?
  ) {
    guard isCurrent(callId: sid, generation: gen) else { return }

    if httpStatus == 429 {
      let wait = max(Self.intervalSeconds, retryAfter ?? Self.defaultRetryAfterSeconds)
      DibayCallLog.info(
        "ios_native_outgoing_terminal_watch_rate_limited",
        sessionId: sid,
        detail: "retry_after_s=\(Int(wait))"
      )
      schedule(callId: sid, generation: gen, after: wait)
      return
    }
    guard let status, status.id == sid else {
      schedule(callId: sid, generation: gen, after: Self.intervalSeconds)
      return
    }
    if status.status == "active" {
      stop(callId: sid, reason: "session_active")
      return
    }
    guard Self.terminalStatuses.contains(status.status) else {
      schedule(callId: sid, generation: gen, after: Self.intervalSeconds)
      return
    }

    let callback: ((String) -> Void)? = locked {
      guard activeCallId == sid, generation == gen else { return nil }
      let cb = onTerminal
      generation &+= 1
      activeCallId = nil
      onTerminal = nil
      return cb
    }
    guard let callback else { return }
    DibayCallLog.info("ios_native_outgoing_terminal_watch_detected", sessionId: sid, detail: "status=\(status.status)")
    callback(status.status)
  }
}
