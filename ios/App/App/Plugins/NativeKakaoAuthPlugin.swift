import Capacitor
import Foundation
import KakaoSDKAuth
import KakaoSDKCommon
import KakaoSDKUser
import os.log

/**
 * P2 STEP 3 — Kakao Native Login (카카오톡 우선 → 카카오 계정).
 * CAPBridgedPlugin — App target compile 시 Capacitor 자동 등록.
 */
@objc(NativeKakaoAuthPlugin)
public class NativeKakaoAuthPlugin: CAPPlugin, CAPBridgedPlugin {
  private static let log = OSLog(subsystem: "com.dibay.app", category: "DIBAY_Kakao")

  public let identifier = "NativeKakaoAuthPlugin"
  public let jsName = "NativeKakaoAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
  ]

  private var pendingCall: CAPPluginCall?

  private func logEvent(_ event: String, _ detail: String = "") {
    let message = detail.isEmpty ? event : "\(event) \(detail)"
    os_log("%{public}@", log: Self.log, type: .info, message)
    CAPLog.print("[DIBAY_Kakao] \(message)")
  }

  private func rejectPending(code: String, message: String) {
    guard let call = pendingCall else { return }
    pendingCall = nil
    call.reject(code, message)
  }

  private func isValidKakaoAppKey(_ raw: String) -> Bool {
    let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if key.isEmpty { return false }
    if key.hasPrefix("$(") { return false }
    if key.contains("YOUR_KAKAO") { return false }
    return true
  }

  private func resolvePending(_ result: JSObject) {
    guard let call = pendingCall else { return }
    pendingCall = nil
    call.resolve(result)
  }

  @objc func signIn(_ call: CAPPluginCall) {
    logEvent("NativeKakaoAuth.signIn called")
    logEvent("kakao_native_started")

    if pendingCall != nil {
      call.reject("kakao_native_in_flight", "Another Kakao sign-in is already in progress")
      return
    }

    guard let appKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String,
      isValidKakaoAppKey(appKey)
    else {
      logEvent("kakao_native_config_error", "KAKAO_NATIVE_APP_KEY missing or placeholder")
      call.reject("kakao_native_config_error", "KAKAO_NATIVE_APP_KEY is not configured")
      return
    }

    let trimmedKey = appKey.trimmingCharacters(in: .whitespacesAndNewlines)
    if !KakaoSDK.isInitialized() {
      KakaoSDK.initSDK(appKey: trimmedKey)
    }

    pendingCall = call

    let handleToken: (OAuthToken?, Error?) -> Void = { [weak self] token, error in
      guard let self = self else { return }

      if let error = error {
        if let clientError = error as? ClientError, clientError.reason == .Cancelled {
          self.logEvent("kakao_native_cancelled")
          self.rejectPending("user_cancelled", "User cancelled Kakao sign-in")
          return
        }
        self.logEvent("kakao_native_config_error", error.localizedDescription)
        self.rejectPending("kakao_native_config_error", error.localizedDescription)
        return
      }

      guard let token = token, !token.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        self.logEvent("kakao_native_token_missing")
        self.rejectPending("kakao_native_token_missing", "Kakao access token missing")
        return
      }

      var result = JSObject()
      result["provider"] = "kakao"
      result["accessToken"] = token.accessToken
      if let refresh = token.refreshToken, !refresh.isEmpty {
        result["refreshToken"] = refresh
      }
      if let idToken = token.idToken, !idToken.isEmpty {
        result["idToken"] = idToken
      }

      UserApi.shared.me { userResult, meError in
        if meError == nil, let user = userResult?.id {
          result["userId"] = String(user)
        }
        self.logEvent("kakao_native_success", "hasToken=true")
        self.resolvePending(result)
      }
    }

    if UserApi.isKakaoTalkLoginAvailable() {
      logEvent("kakao_native_talk_login")
      UserApi.shared.loginWithKakaoTalk(completion: handleToken)
    } else {
      logEvent("kakao_native_account_login")
      UserApi.shared.loginWithKakaoAccount(completion: handleToken)
    }
  }

  @objc func signOut(_ call: CAPPluginCall) {
    UserApi.shared.logout { error in
      if let error = error {
        self.logEvent("kakao_native_signout_failed", error.localizedDescription)
      } else {
        self.logEvent("kakao_native_signout_ok")
      }
      call.resolve()
    }
  }
}
