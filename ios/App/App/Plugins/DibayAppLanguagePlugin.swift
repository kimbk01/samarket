import Capacitor
import Foundation

/**
 * 언어 SSOT S8-1 — 앱 언어(웹 결정)를 네이티브가 읽을 수 있게 저장만 한다.
 *
 * 값: "ko" · "en" = 사용자가 고른(또는 계정의) 앱 언어, 없음 = 기기 언어를 따름.
 * 앱이 꺼진 상태의 네이티브 문구(S8-3·S8-4 예정)가 이 저장값을 읽는다. 이 단계는 저장만 하고 어떤 화면·통화 동작도 바꾸지 않는다.
 *
 * CAPBridgedPlugin — registered natively in DibayRootBridgeViewController.makeAppTargetPlugins().
 */
@objc(DibayAppLanguagePlugin)
public class DibayAppLanguagePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayAppLanguagePlugin"
  public let jsName = "DibayAppLanguage"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
  ]

  static let defaultsKey = "dibay_app_language"

  @objc func set(_ call: CAPPluginCall) {
    let language = Self.normalize(call.getString("language"))
    if let language {
      UserDefaults.standard.set(language, forKey: Self.defaultsKey)
    } else {
      UserDefaults.standard.removeObject(forKey: Self.defaultsKey)
    }
    call.resolve(["language": language as Any])
  }

  @objc func get(_ call: CAPPluginCall) {
    call.resolve(["language": Self.storedLanguage() as Any])
  }

  /** 저장된 앱 언어("ko"·"en"), 없으면 nil(= 기기 언어를 따름). */
  public static func storedLanguage() -> String? {
    normalize(UserDefaults.standard.string(forKey: defaultsKey))
  }

  static func normalize(_ raw: String?) -> String? {
    guard let v = raw?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else { return nil }
    return v == "ko" || v == "en" ? v : nil
  }
}
