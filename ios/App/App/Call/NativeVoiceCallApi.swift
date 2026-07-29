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

  // MARK: - Private

  private static func patchAsync(callId: String, action: String, completion: @escaping PatchCallback) {
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
