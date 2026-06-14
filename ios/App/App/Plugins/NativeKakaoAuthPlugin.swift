import Capacitor
import Foundation
import KakaoSDKAuth
import KakaoSDKCommon
import KakaoSDKUser
import os.log

/**
 * Kakao Native Login — 카카오톡 우선, talk 실패(취소 제외) 시 카카오 계정(SDK WebView).
 * Chrome / Safari / 외부 브라우저 OAuth 금지.
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

  private func logEvent(_ event: String) {
    os_log("%{public}@", log: Self.log, type: .info, event)
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

  private func isUserCancelled(_ error: Error) -> Bool {
    if let clientError = error as? ClientError, clientError.reason == .Cancelled {
      return true
    }
    return error.localizedDescription.lowercased().contains("cancel")
  }

  private func logFailure(_ error: Error) {
    if let clientError = error as? ClientError {
      logEvent("kakao_native_failed \(error.localizedDescription) cause=\(String(describing: clientError.reason))")
      return
    }
    logEvent("kakao_native_failed \(error.localizedDescription)")
  }

  private func rejectLoginError(_ error: Error) {
    logFailure(error)
    let message = error.localizedDescription
    let lower = message.lowercased()
    if lower.contains("kakaotalk is installed") || lower.contains("keyhash") || lower.contains("key hash") {
      rejectPending(code: "kakao_native_key_hash_required", message: message)
      return
    }
    rejectPending(code: "kakao_native_config_error", message: message)
  }

  private func finishLogin(token: OAuthToken?) {
    guard pendingCall != nil else { return }

    guard let token = token, !token.accessToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      logEvent("kakao_native_token_missing")
      rejectPending(code: "kakao_native_token_missing", message: "Kakao access token missing")
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

    UserApi.shared.me { [weak self] userResult, meError in
      guard let self = self else { return }
      guard self.pendingCall != nil else { return }

      if meError == nil, let user = userResult?.id {
        result["userId"] = String(user)
      }
      self.logEvent("kakao_native_success")
      self.resolvePending(result)
    }
  }

  private func handleToken(_ token: OAuthToken?, error: Error?) {
    guard pendingCall != nil else { return }

    if let error = error {
      if isUserCancelled(error) {
        logEvent("kakao_native_cancelled")
        rejectPending(code: "user_cancelled", message: "User cancelled Kakao sign-in")
        return
      }
      rejectLoginError(error)
      return
    }

    finishLogin(token: token)
  }

  @objc func signIn(_ call: CAPPluginCall) {
    logEvent("kakao_native_started")

    if pendingCall != nil {
      call.reject("kakao_native_in_flight", "Another Kakao sign-in is already in progress")
      return
    }

    guard let appKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String,
      isValidKakaoAppKey(appKey)
    else {
      call.reject("kakao_native_config_error", "KAKAO_NATIVE_APP_KEY is not configured")
      return
    }

    let trimmedKey = appKey.trimmingCharacters(in: .whitespacesAndNewlines)
    if !KakaoSDK.isInitialized() {
      KakaoSDK.initSDK(appKey: trimmedKey)
    }

    pendingCall = call

    if UserApi.isKakaoTalkLoginAvailable() {
      logEvent("kakao_native_talk_login")
      UserApi.shared.loginWithKakaoTalk { token, error in
        if self.pendingCall == nil {
          return
        }
        if let error = error, !self.isUserCancelled(error) {
          self.logEvent("kakao_native_talk_fallback_account")
          self.logEvent("kakao_native_account_login")
          UserApi.shared.loginWithKakaoAccount { token, error in
            self.handleToken(token, error: error)
          }
          return
        }
        self.handleToken(token, error: error)
      }
    } else {
      logEvent("kakao_native_account_login")
      UserApi.shared.loginWithKakaoAccount { token, error in
        self.handleToken(token, error: error)
      }
    }
  }

  @objc func signOut(_ call: CAPPluginCall) {
    UserApi.shared.logout { error in
      if error != nil {
        self.logEvent("kakao_native_signout_failed")
      } else {
        self.logEvent("kakao_native_signout_ok")
      }
      call.resolve()
    }
  }
}
