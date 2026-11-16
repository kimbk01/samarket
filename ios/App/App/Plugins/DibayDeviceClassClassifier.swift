import UIKit

/**
 * FD1 DeviceClass authority — iOS native SSOT.
 * Idiom contract is unchanged. Plugin and app-orientation both consume this.
 */
enum DibayDeviceClassClassifier {
  struct Result {
    let deviceClass: String
    let source: String
    let reason: String?

    func asDictionary() -> [String: Any] {
      var out: [String: Any] = [
        "deviceClass": deviceClass,
        "source": source,
      ]
      if let reason {
        out["reason"] = reason
      }
      return out
    }
  }

  /**
   * S2 (docs/audit/mac-ipad-iphone-device-layout-audit-2026-11-16.md §7) — Apple Silicon Mac 에서 도는 iPad 앱은
   * idiom 이 항상 `.pad` 라 idiom 만으로는 iPad 와 구분할 수 없다. Mac 여부는 통화와 같은 단일 정의
   * `DibayCallPlatformCapability.isIOSAppOnMac` 을 읽기만 한다(통화 파일은 바꾸지 않음).
   * Mac = `DESKTOP_MAC` → 웹 기기 프로필 표에서 데스크톱(Windows 와 같은 왼쪽 세로 메뉴).
   */
  static func classify(
    idiom: UIUserInterfaceIdiom = UIDevice.current.userInterfaceIdiom,
    isIOSAppOnMac: Bool = DibayCallPlatformCapability.isIOSAppOnMac
  ) -> Result {
    if isIOSAppOnMac {
      return Result(deviceClass: "DESKTOP_MAC", source: "ios_app_on_mac", reason: nil)
    }
    switch idiom {
    case .phone:
      return Result(deviceClass: "PHONE_IOS", source: "userInterfaceIdiom", reason: nil)
    case .pad:
      return Result(deviceClass: "TABLET_IPAD", source: "userInterfaceIdiom", reason: nil)
    default:
      return Result(deviceClass: "UNKNOWN", source: "unsupported_idiom", reason: "unsupported_idiom")
    }
  }
}
