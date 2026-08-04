import AuthenticationServices
import Capacitor
import Foundation
import os.log
import UIKit

/**
 * iOS Native OAuth launcher — ASWebAuthenticationSession only.
 *
 * Completes the empty iOS owner of the shared OAuth contract (Android: Custom Tabs).
 * Does NOT exchange tokens, touch profile, or navigate.
 * Session completion authority remains OAuthReturnListener → web callback route.
 *
 * callbackURLScheme is fixed to `dibay` (capacitor-return → dibay deep link).
 */
@objc(NativeOAuthLauncherPlugin)
public class NativeOAuthLauncherPlugin: CAPPlugin, CAPBridgedPlugin,
  ASWebAuthenticationPresentationContextProviding
{
  private static let log = OSLog(subsystem: "com.dibay.app", category: "DIBAY_OAuthLauncher")
  private static let callbackScheme = "dibay"
  private static var attemptCounter: UInt64 = 0

  public let identifier = "NativeOAuthLauncherPlugin"
  public let jsName = "NativeOAuthLauncher"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
  ]

  /// Strong reference — local-only session would deallocate and hang.
  private var authSession: ASWebAuthenticationSession?
  private var pendingCall: CAPPluginCall?
  private var activeAttemptId: String?
  private var settled = false
  private var resolveCount = 0
  private var rejectCount = 0
  private var sessionStarted = false
  private var presentationAnchorPresent = false
  private var callbackSchemeMatched = false

  @objc func open(_ call: CAPPluginCall) {
    if pendingCall != nil || authSession != nil {
      logDiag(
        "oauth_launcher_concurrent_blocked",
        fields: [
          "launcherAttemptId": activeAttemptId ?? "none",
          "completionKind": "concurrent_session",
          "resolveCount": String(resolveCount),
          "rejectCount": String(rejectCount),
        ]
      )
      call.reject("oauth_session_in_progress", "oauth_session_in_progress")
      return
    }

    let attemptId = nextAttemptId()
    resetAttemptState(attemptId: attemptId)

    guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !urlString.isEmpty
    else {
      rejectImmediate(call, code: "missing_url", kind: "configuration")
      return
    }

    guard let url = URL(string: urlString), let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http"
    else {
      rejectImmediate(call, code: "invalid_url", kind: "configuration")
      return
    }

    let anchor = resolvePresentationAnchor()
    presentationAnchorPresent = anchor != nil
    guard presentationAnchorPresent else {
      rejectImmediate(call, code: "presentation_anchor_missing", kind: "presentation")
      return
    }

    pendingCall = call
    settled = false

    let session = ASWebAuthenticationSession(
      url: url,
      callbackURLScheme: Self.callbackScheme
    ) { [weak self] callbackURL, error in
      self?.handleSessionCompletion(callbackURL: callbackURL, error: error)
    }
    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false

    authSession = session

    let started = session.start()
    sessionStarted = started
    logDiag(
      "oauth_launcher_session_start",
      fields: [
        "launcherAttemptId": attemptId,
        "sessionStarted": String(started),
        "presentationAnchorPresent": String(presentationAnchorPresent),
        "resolveCount": "0",
        "rejectCount": "0",
      ]
    )

    if !started {
      rejectPending(code: "as_web_auth_start_failed", kind: "presentation")
    }
  }

  public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    if let window = resolvePresentationAnchor() {
      return window
    }
    // open() already rejects when nil; provider requires a non-optional return.
    return ASPresentationAnchor()
  }

  private func handleSessionCompletion(callbackURL: URL?, error: Error?) {
    if let error = error as NSError? {
      if error.domain == ASWebAuthenticationSessionErrorDomain,
        error.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
      {
        rejectPending(code: "oauth_launcher_cancelled", kind: "cancelled")
        return
      }
      rejectPending(code: mapUnknownSessionError(error), kind: "unknown")
      return
    }

    guard let callbackURL = callbackURL else {
      rejectPending(code: "oauth_callback_url_missing", kind: "unknown")
      return
    }

    let scheme = (callbackURL.scheme ?? "").lowercased()
    callbackSchemeMatched = scheme == Self.callbackScheme
    guard callbackSchemeMatched else {
      rejectPending(code: "oauth_callback_scheme_mismatch", kind: "configuration")
      return
    }

    // Success: resolve with callback URL for JS bridge (ASWebAuth does not emit Cap appUrlOpen).
    // Do NOT navigate / exchange / touch profile here — JS deliverNativeOAuthReturnUrl owns that.
    resolvePending(
      kind: "success",
      result: [
        "opened": true,
        "method": "as_web_authentication_session",
        "callbackUrl": callbackURL.absoluteString,
      ]
    )
  }

  private func resolvePending(kind: String, result: [String: Any]) {
    guard !settled, let call = pendingCall else {
      logDuplicateIgnored(kind: kind)
      return
    }
    settled = true
    resolveCount += 1
    logSettled(kind: kind)
    pendingCall = nil
    clearSessionRefs(cancelSession: false)
    call.resolve(result)
  }

  private func rejectPending(code: String, kind: String) {
    guard !settled, let call = pendingCall else {
      logDuplicateIgnored(kind: kind)
      return
    }
    settled = true
    rejectCount += 1
    logSettled(kind: kind)
    pendingCall = nil
    clearSessionRefs(cancelSession: true)
    call.reject(code, code)
  }

  private func rejectImmediate(_ call: CAPPluginCall, code: String, kind: String) {
    settled = true
    rejectCount += 1
    logSettled(kind: kind)
    clearSessionRefs(cancelSession: true)
    call.reject(code, code)
  }

  private func clearSessionRefs(cancelSession: Bool) {
    if cancelSession {
      authSession?.cancel()
    }
    authSession = nil
  }

  private func resetAttemptState(attemptId: String) {
    activeAttemptId = attemptId
    settled = false
    resolveCount = 0
    rejectCount = 0
    sessionStarted = false
    presentationAnchorPresent = false
    callbackSchemeMatched = false
  }

  private func nextAttemptId() -> String {
    Self.attemptCounter &+= 1
    return "iol-\(Self.attemptCounter)-\(Int(Date().timeIntervalSince1970))"
  }

  private func resolvePresentationAnchor() -> ASPresentationAnchor? {
    if let window = bridge?.viewController?.view.window, !window.isHidden {
      return window
    }
    if let key = UIApplication.shared.windows.first(where: { $0.isKeyWindow && !$0.isHidden }) {
      return key
    }
    return nil
  }

  private func mapUnknownSessionError(_ error: NSError) -> String {
    if error.domain == ASWebAuthenticationSessionErrorDomain {
      return "as_web_auth_failed"
    }
    return "oauth_launcher_unknown"
  }

  private func logSettled(kind: String) {
    logDiag(
      "oauth_launcher_settled",
      fields: [
        "launcherAttemptId": activeAttemptId ?? "none",
        "sessionStarted": String(sessionStarted),
        "presentationAnchorPresent": String(presentationAnchorPresent),
        "completionKind": kind,
        "callbackSchemeMatched": String(callbackSchemeMatched),
        "resolveCount": String(resolveCount),
        "rejectCount": String(rejectCount),
      ]
    )
  }

  private func logDuplicateIgnored(kind: String) {
    logDiag(
      "oauth_launcher_duplicate_ignored",
      fields: [
        "launcherAttemptId": activeAttemptId ?? "none",
        "completionKind": kind,
        "callbackSchemeMatched": String(callbackSchemeMatched),
        "resolveCount": String(resolveCount),
        "rejectCount": String(rejectCount),
      ]
    )
  }

  private func logDiag(_ event: String, fields: [String: String] = [:]) {
    var parts = ["event=\(event)"]
    for key in fields.keys.sorted() {
      if let value = fields[key] {
        parts.append("\(key)=\(value)")
      }
    }
    os_log("%{public}@", log: Self.log, type: .info, parts.joined(separator: " "))
  }
}
