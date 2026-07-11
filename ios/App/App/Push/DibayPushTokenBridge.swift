import Foundation
import Capacitor
import WebKit

/// JS 브리지 — VoIP token·deep link (Capacitor WebView).
enum DibayPushTokenBridge {
  private static var pendingScripts: [String] = []
  private static var replayWorkItem: DispatchWorkItem?
  private static var lastVoipToken: String?
  private static var voipDeliveryRetryGeneration = 0

  static func postVoipToken(_ token: String) {
    let normalized = token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else { return }
    lastVoipToken = normalized
    deliverVoipTokenEvent(normalized)
    scheduleVoipTokenDeliveryRetries()
  }

  static func replayLastVoipTokenIfPresent() {
    guard let token = lastVoipToken, !token.isEmpty else { return }
    DibayCallLog.info("ios_voip_bridge_replay_last_token", detail: "len=\(token.count)")
    deliverVoipTokenEvent(token)
  }

  static func postVoipTokenInvalidated() {
    lastVoipToken = nil
    voipDeliveryRetryGeneration += 1
    evaluateJs("window.dispatchEvent(new CustomEvent('dibay:voip-token-invalidated'));")
  }

  private static func deliverVoipTokenEvent(_ token: String) {
    let escaped = token.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
    evaluateJs("""
      window.dispatchEvent(new CustomEvent('dibay:voip-token', { detail: { token: '\(escaped)' } }));
    """)
  }

  private static func scheduleVoipTokenDeliveryRetries() {
    voipDeliveryRetryGeneration += 1
    let generation = voipDeliveryRetryGeneration
    for delay in [1.0, 3.0, 8.0, 15.0] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        guard generation == voipDeliveryRetryGeneration, let token = lastVoipToken, !token.isEmpty else { return }
        DibayCallLog.info("ios_voip_bridge_retry", detail: "delay=\(delay)")
        deliverVoipTokenEvent(token)
      }
    }
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
    DibayCallLog.info("ios_voip_bridge_replay", detail: "count=\(scripts.count)")
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
      DibayCallLog.info("ios_voip_bridge_queued", detail: "pending=\(pendingScripts.count)")
      scheduleReplay()
    }
  }
}
