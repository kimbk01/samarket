import AuthenticationServices
import Capacitor
import CryptoKit
import Foundation
import os.log
import UIKit

/**
 * P2 — Sign in with Apple via AuthenticationServices.
 * CAPBridgedPlugin — App target compile 시 Capacitor 자동 등록.
 * Xcode: Sign in with Apple capability + com.dibay.app
 *
 * Diagnostic-only events (no auth behavior change): appleAttemptId correlation,
 * lifecycle/anchor/thread fields, completion-timeout observe (no auto reject/retry).
 */
@objc(NativeAppleAuthPlugin)
public class NativeAppleAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private static let log = OSLog(subsystem: "com.dibay.app", category: "DIBAY_Apple")
  private static var attemptCounter: UInt64 = 0

  public let identifier = "NativeAppleAuthPlugin"
  public let jsName = "NativeAppleAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
  ]

  private var pendingCall: CAPPluginCall?
  private var currentNonce: String?
  private var activeAttemptId: String?
  private var attemptStartedAt: Date?
  private var delegateCallbackCount: Int = 0
  private var resolveCount: Int = 0
  private var rejectCount: Int = 0
  private var sceneObserversInstalled = false
  private var completionTimeoutWorkItem: DispatchWorkItem?
  /// Diagnostic only — prior attempt token fingerprint prefix (no token body).
  private var lastTokenFingerprintPrefix: String?

  /// Diagnostic only: mirrors whether a strong controller property exists.
  /// Current production path keeps controller as a local — always false until a root fix retains it.
  private var retainedControllerPresent: Bool { false }

  /// Decode JWT payload claims for diagnostics. Never logs token body / sub / email.
  private func logIdentityTokenClaimDiagnostics(identityToken: String, attemptId: String?) {
    let nowSec = Int(Date().timeIntervalSince1970)
    let fpFull = sha256(identityToken)
    let fpPrefix = String(fpFull.prefix(8))
    let reusedVsPriorAttempt =
      lastTokenFingerprintPrefix != nil && lastTokenFingerprintPrefix == fpPrefix
    lastTokenFingerprintPrefix = fpPrefix

    var iatSec = -1
    var expSec = -1
    var issMatched = false
    var audMatched = false
    var nonceMatched = false
    var claimParseOk = false

    let parts = identityToken.split(separator: ".", omittingEmptySubsequences: false)
    if parts.count >= 2 {
      var payloadB64 = String(parts[1])
        .replacingOccurrences(of: "-", with: "+")
        .replacingOccurrences(of: "_", with: "/")
      let pad = (4 - payloadB64.count % 4) % 4
      if pad > 0 { payloadB64 += String(repeating: "=", count: pad) }
      if let data = Data(base64Encoded: payloadB64),
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      {
        claimParseOk = true
        if let iat = json["iat"] as? NSNumber { iatSec = iat.intValue }
        else if let iat = json["iat"] as? Int { iatSec = iat }
        if let exp = json["exp"] as? NSNumber { expSec = exp.intValue }
        else if let exp = json["exp"] as? Int { expSec = exp }
        let iss = (json["iss"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        issMatched = iss == "https://appleid.apple.com"
        let aud: String = {
          if let s = json["aud"] as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
          if let arr = json["aud"] as? [String] {
            return arr.first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
          }
          return ""
        }()
        // Bundle ID expected for Native SIWA — not a secret.
        audMatched = aud == "com.dibay.app"
        if let tokenNonce = json["nonce"] as? String, let raw = currentNonce, !raw.isEmpty {
          nonceMatched = tokenNonce == sha256(raw)
        }
      }
    }

    let expMinusIat = (iatSec >= 0 && expSec >= 0) ? (expSec - iatSec) : -1
    let expMinusNow = expSec >= 0 ? (expSec - nowSec) : -1
    let nowMinusIat = iatSec >= 0 ? (nowSec - iatSec) : -1
    // Same threshold as server assertIatValid (diagnostic only — does not change accept/reject).
    let wouldFailCustomWindow = expMinusIat > 600 + 60

    logEvent(
      "apple_native_token_claims",
      [
        "appleAttemptId=\(attemptId ?? "none")",
        "claimParseOk=\(claimParseOk)",
        "iatSec=\(iatSec)",
        "expSec=\(expSec)",
        "nowSec=\(nowSec)",
        "expMinusIatSec=\(expMinusIat)",
        "expMinusNowSec=\(expMinusNow)",
        "nowMinusIatSec=\(nowMinusIat)",
        "issuerMatched=\(issMatched)",
        "audienceMatched=\(audMatched)",
        "nonceMatched=\(nonceMatched)",
        "tokenFingerprintHashPrefix=\(fpPrefix)",
        "freshFromThisSiwaAttempt=true",
        "reusedVsPriorAttemptFingerprint=\(reusedVsPriorAttempt)",
        "wouldFailCustomWindow660=\(wouldFailCustomWindow)",
        "units=seconds",
      ].joined(separator: " ")
    )
  }

  private func logEvent(_ event: String, _ detail: String = "") {
    let message = detail.isEmpty ? event : "\(event) \(detail)"
    os_log("%{public}@", log: Self.log, type: .info, message)
    CAPLog.print("[DIBAY_Apple] \(message)")
  }

  private func nextAttemptId() -> String {
    Self.attemptCounter &+= 1
    let suffix = String(Int(Date().timeIntervalSince1970 * 1000) % 1_000_000)
    return "AP-\(suffix)-\(Self.attemptCounter)"
  }

  private func elapsedMs() -> Int {
    guard let started = attemptStartedAt else { return -1 }
    return Int(Date().timeIntervalSince(started) * 1000)
  }

  private func applicationStateRaw() -> Int {
    if Thread.isMainThread {
      return UIApplication.shared.applicationState.rawValue
    }
    var state = -1
    DispatchQueue.main.sync {
      state = UIApplication.shared.applicationState.rawValue
    }
    return state
  }

  private func sceneActivationStateRaw() -> Int {
    let read: () -> Int = {
      if #available(iOS 13.0, *) {
        let scenes = UIApplication.shared.connectedScenes
        if let foreground = scenes.first(where: { $0.activationState == .foregroundActive }) {
          return foreground.activationState.rawValue
        }
        return scenes.first?.activationState.rawValue ?? -1
      }
      return -1
    }
    if Thread.isMainThread {
      return read()
    }
    var state = -1
    DispatchQueue.main.sync {
      state = read()
    }
    return state
  }

  private func diagFields(
    extra: [String: String] = [:]
  ) -> String {
    var parts: [String] = [
      "appleAttemptId=\(activeAttemptId ?? "none")",
      "elapsedMs=\(elapsedMs())",
      "isMainThread=\(Thread.isMainThread)",
      "applicationState=\(applicationStateRaw())",
      "sceneActivationState=\(sceneActivationStateRaw())",
      "controllerRetained=\(retainedControllerPresent)",
      "pendingCallPresent=\(pendingCall != nil)",
      "delegateCallbackCount=\(delegateCallbackCount)",
      "resolveCount=\(resolveCount)",
      "rejectCount=\(rejectCount)",
    ]
    for (k, v) in extra.sorted(by: { $0.key < $1.key }) {
      parts.append("\(k)=\(v)")
    }
    return parts.joined(separator: " ")
  }

  private func logDiag(_ event: String, extra: [String: String] = [:]) {
    logEvent(event, diagFields(extra: extra))
  }

  private func ensureSceneObservers() {
    guard !sceneObserversInstalled else { return }
    sceneObserversInstalled = true
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(onWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(onDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(onDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  @objc private func onWillResignActive() {
    guard activeAttemptId != nil, pendingCall != nil else { return }
    logDiag("apple_native_scene_will_resign_active")
  }

  @objc private func onDidEnterBackground() {
    guard activeAttemptId != nil, pendingCall != nil else { return }
    logDiag("apple_native_scene_did_enter_background")
  }

  @objc private func onDidBecomeActive() {
    guard activeAttemptId != nil, pendingCall != nil else { return }
    logDiag("apple_native_scene_did_become_active")
  }

  private func scheduleCompletionTimeoutObservation(attemptId: String) {
    completionTimeoutWorkItem?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self = self else { return }
      guard self.activeAttemptId == attemptId, self.pendingCall != nil else { return }
      // Diagnostic only — do not reject, retry, or change user-facing error.
      self.logDiag("apple_native_completion_timeout_observed")
    }
    completionTimeoutWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: work)
  }

  private func clearAttemptState() {
    completionTimeoutWorkItem?.cancel()
    completionTimeoutWorkItem = nil
    activeAttemptId = nil
    attemptStartedAt = nil
  }

  @objc func signIn(_ call: CAPPluginCall) {
    ensureSceneObservers()

    if pendingCall != nil {
      let rejectedAttempt = nextAttemptId()
      logEvent(
        "apple_native_signin_enter",
        "appleAttemptId=\(rejectedAttempt) pendingCallPresent=true code=apple_native_in_flight activeAttemptId=\(activeAttemptId ?? "none")"
      )
      logEvent(
        "apple_native_cap_call_reject_begin",
        "appleAttemptId=\(rejectedAttempt) code=apple_native_in_flight"
      )
      call.reject("apple_native_in_flight", "Another Apple sign-in is already in progress")
      logEvent(
        "apple_native_cap_call_reject_end",
        "appleAttemptId=\(rejectedAttempt) code=apple_native_in_flight"
      )
      return
    }

    let attemptId = nextAttemptId()
    activeAttemptId = attemptId
    attemptStartedAt = Date()
    delegateCallbackCount = 0
    resolveCount = 0
    rejectCount = 0

    logDiag("apple_native_signin_enter")
    logDiag("apple_native_main_thread_check")

    guard #available(iOS 13.0, *) else {
      rejectCount += 1
      logDiag("apple_native_cap_call_reject_begin", extra: ["code": "apple_native_config_error"])
      call.reject("apple_native_config_error", "Sign in with Apple requires iOS 13+")
      logDiag("apple_native_cap_call_reject_end", extra: ["code": "apple_native_config_error"])
      pendingCall = nil
      currentNonce = nil
      clearAttemptState()
      return
    }

    pendingCall = call
    let nonce = randomNonceString()
    currentNonce = nonce

    let appleIDProvider = ASAuthorizationAppleIDProvider()
    let request = appleIDProvider.createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(nonce)
    logDiag("apple_native_request_created")

    // LOCAL only — not stored on self. retainedControllerPresent stays false (diagnostic truth).
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    logDiag("apple_native_delegate_assigned")
    controller.presentationContextProvider = self
    logDiag("apple_native_presentation_provider_assigned")

    // Probe anchor before performRequests (same resolution path as presentationAnchor).
    let anchor = resolvePresentationAnchor()
    let anchorPresent = anchor != nil
    let sceneHash = anchorSceneIdHash(for: anchor)
    logDiag(
      "apple_native_anchor_resolved",
      extra: [
        "anchorPresent": String(anchorPresent),
        "anchorSceneIdHash": sceneHash,
      ]
    )

    scheduleCompletionTimeoutObservation(attemptId: attemptId)
    controller.performRequests()
    logDiag("apple_native_perform_requests")
    // Legacy alias kept for prior console greps; not proof of visible SIWA UI.
    logEvent("apple_provider_ui_presented", diagFields())
  }

  @available(iOS 13.0, *)
  private func resolvePresentationAnchor() -> ASPresentationAnchor? {
    if let window = bridge?.viewController?.view.window {
      return window
    }
    if let key = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
      return key
    }
    return nil
  }

  private func anchorSceneIdHash(for anchor: ASPresentationAnchor?) -> String {
    guard let window = anchor else { return "none" }
    if #available(iOS 13.0, *), let scene = window.windowScene {
      var hasher = Hasher()
      hasher.combine(ObjectIdentifier(scene))
      return String(abs(hasher.finalize()) % 10_000)
    }
    return "no_scene"
  }

  @available(iOS 13.0, *)
  public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    if let window = resolvePresentationAnchor() {
      return window
    }
    // Existing fallback — empty anchor; diagnostic already logged anchorPresent=false when nil.
    return ASPresentationAnchor()
  }

  @available(iOS 13.0, *)
  public func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    delegateCallbackCount += 1
    logDiag("apple_native_delegate_success_enter")

    defer {
      pendingCall = nil
      currentNonce = nil
      clearAttemptState()
    }

    guard let call = pendingCall else {
      logDiag("apple_native_delegate_success_enter", extra: ["pendingCallPresent": "false", "early": "no_pending_call"])
      return
    }

    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      logDiag(
        "apple_native_credential_classified",
        extra: [
          "identityTokenPresent": "false",
          "authorizationCodePresent": "false",
          "userIdPresent": "false",
          "castOk": "false",
        ]
      )
      rejectCount += 1
      logDiag("apple_native_cap_call_reject_begin", extra: ["code": "apple_native_token_missing"])
      call.reject("apple_native_token_missing", "Missing Apple ID credential")
      logDiag("apple_native_cap_call_reject_end", extra: ["code": "apple_native_token_missing"])
      return
    }

    let tokenPresent = credential.identityToken != nil
    let codePresent = credential.authorizationCode != nil
    let userPresent = !credential.user.isEmpty
    logDiag(
      "apple_native_credential_classified",
      extra: [
        "identityTokenPresent": String(tokenPresent),
        "authorizationCodePresent": String(codePresent),
        "userIdPresent": String(userPresent),
        "castOk": "true",
      ]
    )

    guard let identityTokenData = credential.identityToken,
      let identityToken = String(data: identityTokenData, encoding: .utf8),
      !identityToken.isEmpty
    else {
      rejectCount += 1
      logDiag("apple_native_cap_call_reject_begin", extra: ["code": "apple_native_token_missing"])
      call.reject("apple_native_token_missing", "identityToken missing")
      logDiag("apple_native_cap_call_reject_end", extra: ["code": "apple_native_token_missing"])
      return
    }

    logIdentityTokenClaimDiagnostics(identityToken: identityToken, attemptId: activeAttemptId)

    var result = JSObject()
    result["provider"] = "apple"
    result["identityToken"] = identityToken
    result["nonce"] = currentNonce

    if !credential.user.isEmpty {
      result["userIdentifier"] = credential.user
    }

    if let authCodeData = credential.authorizationCode,
      let authCode = String(data: authCodeData, encoding: .utf8),
      !authCode.isEmpty
    {
      result["authorizationCode"] = authCode
    }

    if let email = credential.email, !email.isEmpty {
      result["email"] = email
    }

    if let fullName = credential.fullName {
      let formatter = PersonNameComponentsFormatter()
      let formatted = formatter.string(from: fullName).trimmingCharacters(in: .whitespacesAndNewlines)
      if !formatted.isEmpty {
        result["fullName"] = formatted
      }
    }

    resolveCount += 1
    logDiag("apple_native_cap_call_resolve_begin")
    call.resolve(result)
    logDiag("apple_native_cap_call_resolve_end")
    logEvent("apple_native_success", diagFields(extra: ["hasUserId": String(userPresent)]))
  }

  @available(iOS 13.0, *)
  public func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    delegateCallbackCount += 1
    let nsError = error as NSError
    logDiag(
      "apple_native_delegate_error_enter",
      extra: [
        "nativeErrorDomain": nsError.domain,
        "nativeErrorCode": String(nsError.code),
      ]
    )

    defer {
      pendingCall = nil
      currentNonce = nil
      clearAttemptState()
    }

    guard let call = pendingCall else { return }

    if nsError.domain == ASAuthorizationError.errorDomain,
      nsError.code == ASAuthorizationError.canceled.rawValue
    {
      rejectCount += 1
      logDiag("apple_native_cap_call_reject_begin", extra: ["code": "user_cancelled"])
      call.reject("user_cancelled", "User cancelled Apple sign-in")
      logDiag("apple_native_cap_call_reject_end", extra: ["code": "user_cancelled"])
      logEvent("apple_native_cancelled", diagFields())
      return
    }

    rejectCount += 1
    logDiag(
      "apple_native_cap_call_reject_begin",
      extra: [
        "code": "apple_native_config_error",
        "nativeErrorDomain": nsError.domain,
        "nativeErrorCode": String(nsError.code),
      ]
    )
    // Do not log localizedDescription (may contain PII).
    call.reject("apple_native_config_error", error.localizedDescription)
    logDiag("apple_native_cap_call_reject_end", extra: ["code": "apple_native_config_error"])
    logEvent("apple_native_config_error", diagFields())
  }

  private func randomNonceString(length: Int = 32) -> String {
    precondition(length > 0)
    let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remaining = length

    while remaining > 0 {
      var random: UInt8 = 0
      let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
      if status != errSecSuccess {
        fatalError("Unable to generate nonce.")
      }
      if random < charset.count {
        result.append(charset[Int(random)])
        remaining -= 1
      }
    }
    return result
  }

  private func sha256(_ input: String) -> String {
    let inputData = Data(input.utf8)
    let hashed = SHA256.hash(data: inputData)
    return hashed.compactMap { String(format: "%02x", $0) }.joined()
  }
}
