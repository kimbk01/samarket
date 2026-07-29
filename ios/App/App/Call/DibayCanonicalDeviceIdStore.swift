import Foundation
import WebKit
import Capacitor

/**
 * Canonical call/push device identity — must match `user_devices.device_id`
 * (`dibay:client_instance_id` from Web register), not IDFV.
 *
 * @see docs/dibay-call-multi-device-policy.md
 */
enum DibayCanonicalDeviceIdStore {
  private static let defaultsKey = "dibay_canonical_device_id"
  private static let localStorageKey = "dibay:client_instance_id"

  static func save(_ deviceId: String) {
    let id = deviceId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !id.isEmpty else { return }
    UserDefaults.standard.set(id, forKey: defaultsKey)
  }

  static func resolveCached() -> String? {
    let id = (UserDefaults.standard.string(forKey: defaultsKey) ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return id.isEmpty ? nil : id
  }

  /**
   * Resolve for Native accept / answered_elsewhere.
   * Prefer UserDefaults (persisted after register); else read WebView localStorage once.
   */
  static func resolve(completion: @escaping (String?) -> Void) {
    if let cached = resolveCached() {
      completion(cached)
      return
    }
    DispatchQueue.main.async {
      guard let webView = resolveWebView() else {
        completion(nil)
        return
      }
      let js = "localStorage.getItem('\(localStorageKey)')"
      webView.evaluateJavaScript(js) { result, _ in
        let raw = (result as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !raw.isEmpty {
          save(raw)
          completion(raw)
        } else {
          completion(nil)
        }
      }
    }
  }

  private static func resolveWebView() -> WKWebView? {
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
    return webView
  }
}
