import Foundation
import Capacitor
import WebKit

/// JS 브리지 — VoIP token·deep link (Capacitor WebView).
enum DibayPushTokenBridge {
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

  private static func evaluateJs(_ script: String) {
    DispatchQueue.main.async {
      guard
        let window = UIApplication.shared.connectedScenes
          .compactMap({ $0 as? UIWindowScene })
          .flatMap({ $0.windows })
          .first(where: { $0.isKeyWindow }),
        let root = window.rootViewController as? CAPBridgeViewController,
        let webView = root.webView
      else { return }
      webView.evaluateJavaScript(script, completionHandler: nil)
    }
  }
}
