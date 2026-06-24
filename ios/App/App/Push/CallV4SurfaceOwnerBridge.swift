import Capacitor
import Foundation
import UIKit
import WebKit

/// V4 — atomic surface owner SSOT bridge (`dibay:call-surface-owner`), mirrors Android MainActivity.
enum CallV4SurfaceOwnerBridge {
  private struct PendingOwner {
    let owner: String
    let reason: String
    let tsMs: Int64
  }

  private static var pendingByCallId: [String: PendingOwner] = [:]

  static func deliver(callId: String, owner: String, reason: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let ownerNorm = owner.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let src = reason.trimmingCharacters(in: .whitespacesAndNewlines)
    let reasonNorm = src.isEmpty ? "native" : src
    let tsMs = Int64(Date().timeIntervalSince1970 * 1000)

    if inject(callId: sid, owner: ownerNorm, reason: reasonNorm, tsMs: tsMs) {
      return
    }
    pendingByCallId[sid] = PendingOwner(owner: ownerNorm, reason: reasonNorm, tsMs: tsMs)
    NSLog(
      "[DIBAY_CALL_V4] surface_owner_bridge_queued callId=%@ owner=%@ reason=%@",
      sid,
      ownerNorm,
      reasonNorm
    )
  }

  @discardableResult
  static func claimForegroundWebInAppIfActive(callId: String, reason: String = "ios_foreground_active") -> Bool {
    guard UIApplication.shared.applicationState == .active else { return false }
    deliver(callId: callId, owner: "web_in_app", reason: reason)
    return true
  }

  static func flushPending() {
    guard !pendingByCallId.isEmpty else { return }
    let entries = pendingByCallId
    pendingByCallId.removeAll()
    for (callId, pending) in entries {
      _ = inject(callId: callId, owner: pending.owner, reason: pending.reason, tsMs: pending.tsMs)
    }
  }

  @discardableResult
  private static func inject(callId: String, owner: String, reason: String, tsMs: Int64) -> Bool {
    guard let webView = resolveWebView() else { return false }
    let safeCallId = jsEscape(callId)
    let safeOwner = jsEscape(owner)
    let safeReason = jsEscape(reason)
    let js = """
    (function(){try{window.dispatchEvent(new CustomEvent('dibay:call-surface-owner',{detail:{callId:'\(safeCallId)',owner:'\(safeOwner)',reason:'\(safeReason)',ts:\(tsMs)}}));}catch(e){}})();
    """
    DispatchQueue.main.async {
      webView.evaluateJavaScript(js, completionHandler: nil)
    }
    NSLog(
      "[DIBAY_CALL_V4] surface_owner_bridge_injected callId=%@ owner=%@ reason=%@",
      callId,
      owner,
      reason
    )
    return true
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

  private static func jsEscape(_ value: String) -> String {
    value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "'", with: "\\'")
  }
}
