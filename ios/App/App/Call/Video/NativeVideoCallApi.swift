import Foundation
import UIKit
import WebKit
import Capacitor

/**
 * Phase B1 — iOS Native Video HTTP facade.
 * Ports Android `NativeVideoCallApi` contract. WebView is not part of call establishment.
 * Auth: Cookie header from WKWebView cookie store for Capacitor server.origin.
 */
enum NativeVideoCallApi {
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
    patchAsync(
      callId: callId,
      action: "accept",
      startMarker: "accept_patch_start",
      doneMarker: "accept_patch_done",
      completion: completion
    )
  }

  static func rejectAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(
      callId: callId,
      action: "reject",
      startMarker: "reject_patch_start",
      doneMarker: "reject_patch_done",
      completion: completion
    )
  }

  static func endAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(
      callId: callId,
      action: "end",
      startMarker: "end_patch_start",
      doneMarker: "end_patch_done",
      completion: completion
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
    NativeVideoOutgoingCallCoordinator.shared.handleOutgoing(
      callId: sid,
      roomId: roomId,
      peerUserId: peerUserId,
      peerName: peerName,
      mediaType: mediaType
    )
  }

  static func missedAsync(callId: String, completion: @escaping PatchCallback) {
    patchAsync(
      callId: callId,
      action: "missed",
      startMarker: "missed_patch_start",
      doneMarker: "missed_patch_done",
      completion: completion
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

    NativeVideoCallLog.info("token_fetch_start", callId: sid)

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
          NativeVideoCallLog.info("token_fetch_done", callId: sid, details: "status=\(status)")
          completion(
            TokenConnection(appId: appId, channelName: channelName, uid: uid, token: token),
            nil
          )
        }
      }
      task.resume()
    }
  }

  // MARK: - Private

  private static func patchAsync(
    callId: String,
    action: String,
    startMarker: String,
    doneMarker: String,
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

    NativeVideoCallLog.info(startMarker, callId: sid)

    let once = OnceBox()
    resolveCookieHeader(origin: origin) { cookieHeader in
      var request = URLRequest(url: url, timeoutInterval: timeoutSeconds)
      request.httpMethod = "PATCH"
      request.setValue("application/json", forHTTPHeaderField: "Accept")
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      if let cookieHeader, !cookieHeader.isEmpty {
        request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
      }
      let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? ""
      var bodyObj: [String: Any] = ["action": action]
      if !deviceId.isEmpty {
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
        if ok {
          NativeVideoCallLog.info(doneMarker, callId: sid, details: "status=\(status)")
        } else {
          NativeVideoCallLog.warn(
            "error_terminal",
            callId: sid,
            details: "action=\(action) status=\(status) err=\(errMsg ?? "")"
          )
        }
        once.run { completion(ok, status, errMsg) }
      }
      task.resume()
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
