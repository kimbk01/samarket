import Foundation

/**
 * 언어 SSOT S8-3 — 통화 네이티브 문구.
 *
 * 언어 = 앱에서 고른 언어(S8-1 `DibayAppLanguagePlugin` 저장값) → 없으면 기기 언어(OS 가 고른 ko·en 지역화,
 * 그 외 언어 → 영어). 표시할 때마다 읽는다(앱이 꺼진 상태의 수신도 마지막 저장값).
 * 문구 원본 = `ko.lproj`·`en.lproj/Localizable.strings`. 문구만 고른다 — 통화 분기·타이밍과 무관.
 */
enum DibayNativeCopy {
  private static let missing = "\u{0}dibay_missing\u{0}"

  static func language() -> String {
    if let stored = UserDefaults.standard.string(forKey: DibayAppLanguagePlugin.defaultsKey),
      stored == "ko" || stored == "en"
    {
      return stored
    }
    let preferred = Bundle.main.preferredLocalizations.first ?? "en"
    return preferred.hasPrefix("ko") ? "ko" : "en"
  }

  static func text(_ key: String) -> String {
    let primary = language()
    for lang in [primary, "en", "ko"] {
      if let path = Bundle.main.path(forResource: lang, ofType: "lproj"),
        let bundle = Bundle(path: path)
      {
        let value = bundle.localizedString(forKey: key, value: missing, table: nil)
        if value != missing { return value }
      }
    }
    return key
  }
}
