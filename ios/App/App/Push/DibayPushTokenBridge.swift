import Foundation
import Capacitor
import WebKit

/// JS 브리지 — VoIP token·deep link (Capacitor WebView).
enum DibayPushTokenBridge {
  private static var pendingScripts: [String] = []
  private static var replayWorkItem: DispatchWorkItem?

  static func postVoipToken(_ token: String) {
    let escaped = token.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    evaluateJs("""
      window.dispatchEvent(new CustomEvent('dibay:voip-token', { detail: { token: '\(escaped)' } }));
    """)
  }

  static func postVoipTokenInvalidated() {
    evaluateJs("window.dispatchEvent(new CustomEvent('dibay:voip-token-invalidated'));")
  }

  static func openCallDeepLink(sessionId: String) {
    let escaped = sessionId.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    evaluateJs("""
      window.dispatchEvent(new CustomEvent('dibay:voip-call-action', { detail: { sessionId: '\(escaped)', action: 'accept' } }));
      window.location.assign('/community-messenger/calls/\(escaped)?action=accept');
    """)
  }

  static func postCallAction(sessionId: String, action: String) {
    let escapedSession = sessionId.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    let escapedAction = action.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    evaluateJs("""
      window.dispatchEvent(new CustomEvent('dibay:voip-call-action', { detail: { sessionId: '\(escapedSession)', action: '\(escapedAction)' } }));
    """)
  }

  private static func resolveWebView() -> WKWebView? {
    guard
      let window = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow }),
      let root = window.rootViewController as? CAPBridgeViewController,
      let webView = root.webView
    else { return nil }
    return webView
  }

  private static func flushPending(into webView: WKWebView) {
    guard !pendingScripts.isEmpty else { return }
    let scripts = pendingScripts
    pendingScripts.removeAll()
    NSLog("[DIBAY_CALL] ios_voip_bridge_replay count=%d", scripts.count)
    for script in scripts {
      webView.evaluateJavaScript(script, completionHandler: nil)
    }
  }

  private static func scheduleReplay() {
    guard replayWorkItem == nil else { return }
    let work = DispatchWorkItem {
      replayWorkItem = nil
      guard !pendingScripts.isEmpty else { return }
      if let webView = resolveWebView() {
        flushPending(into: webView)
      }
      if !pendingScripts.isEmpty {
        scheduleReplay()
      }
    }
    replayWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: work)
  }

  private static func evaluateJs(_ script: String) {
    DispatchQueue.main.async {
      if let webView = resolveWebView() {
        flushPending(into: webView)
        webView.evaluateJavaScript(script, completionHandler: nil)
        return
      }
      pendingScripts.append(script)
      NSLog("[DIBAY_CALL] ios_voip_bridge_queued pending=%d", pendingScripts.count)
      scheduleReplay()
    }
  }
}
