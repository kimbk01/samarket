import AuthenticationServices
import Capacitor
import CryptoKit
import Foundation
import os.log

/**
 * P2 — Sign in with Apple via AuthenticationServices.
 * CAPBridgedPlugin — App target compile 시 Capacitor 자동 등록.
 * Xcode: Sign in with Apple capability + com.dibay.app
 */
@objc(NativeAppleAuthPlugin)
public class NativeAppleAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  private static let log = OSLog(subsystem: "com.dibay.app", category: "DIBAY_Apple")

  public let identifier = "NativeAppleAuthPlugin"
  public let jsName = "NativeAppleAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
  ]

  private var pendingCall: CAPPluginCall?
  private var currentNonce: String?

  private func logEvent(_ event: String, _ detail: String = "") {
    let message = detail.isEmpty ? event : "\(event) \(detail)"
    os_log("%{public}@", log: Self.log, type: .info, message)
    CAPLog.print("[DIBAY_Apple] \(message)")
  }

  @objc func signIn(_ call: CAPPluginCall) {
    logEvent("NativeAppleAuth.signIn called")
    logEvent("apple_native_started")

    if pendingCall != nil {
      call.reject("apple_native_in_flight", "Another Apple sign-in is already in progress")
      return
    }

    guard #available(iOS 13.0, *) else {
      call.reject("apple_native_config_error", "Sign in with Apple requires iOS 13+")
      return
    }

    pendingCall = call
    let nonce = randomNonceString()
    currentNonce = nonce

    let appleIDProvider = ASAuthorizationAppleIDProvider()
    let request = appleIDProvider.createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(nonce)

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  @available(iOS 13.0, *)
  public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    guard let window = bridge?.viewController?.view.window else {
      return UIApplication.shared.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
    return window
  }

  @available(iOS 13.0, *)
  public func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    defer {
      pendingCall = nil
      currentNonce = nil
    }

    guard let call = pendingCall else { return }

    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
      logEvent("apple_native_token_missing", "missing_credential")
      call.reject("apple_native_token_missing", "Missing Apple ID credential")
      return
    }

    guard let identityTokenData = credential.identityToken,
      let identityToken = String(data: identityTokenData, encoding: .utf8),
      !identityToken.isEmpty
    else {
      logEvent("apple_native_token_missing", "identityToken")
      call.reject("apple_native_token_missing", "identityToken missing")
      return
    }

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

    logEvent("apple_native_success", "hasUserId=\(!credential.user.isEmpty)")
    call.resolve(result)
  }

  @available(iOS 13.0, *)
  public func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    defer {
      pendingCall = nil
      currentNonce = nil
    }

    guard let call = pendingCall else { return }

    let nsError = error as NSError
    if nsError.domain == ASAuthorizationError.errorDomain,
      nsError.code == ASAuthorizationError.canceled.rawValue
    {
      logEvent("apple_native_cancelled")
      call.reject("user_cancelled", "User cancelled Apple sign-in")
      return
    }

    logEvent("apple_native_config_error", nsError.localizedDescription)
    call.reject("apple_native_config_error", error.localizedDescription)
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
