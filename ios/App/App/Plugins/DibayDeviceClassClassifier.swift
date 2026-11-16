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

/**
 * S3 — 기기 프로필 표(`lib/device/dibay-device-profile.ts`)의 네이티브 값. 계약 시험이 표와 같은지 검사한다.
 * Mac 에서 iPad 앱은 77% 로 그려진다(2026-11-16 실측: CSS 1056 → 814pt). 웹뷰 배율 1 ÷ 0.77 로 되돌려
 * CSS 1px = Mac 1pt = Windows·PC 브라우저와 같은 크기로 만든다. 창 최소 크기는 Mac pt 로 정하고,
 * 장면(scene) 좌표는 iPad 점 단위라 0.77 로 나눠 넣는다.
 */
enum DibayDeviceProfileNative {
  /// Mac 에서 iPad 앱이 그려지는 배율 (실측)
  static let macIpadAppScale: CGFloat = 0.77
  /// 창 최소 크기 (Mac pt) — Telegram Mac 최소 창과 같음
  static let macMinimumWindowPt = CGSize(width: 380, height: 550)

  static func webViewPageZoom(deviceClass: String) -> CGFloat {
    deviceClass == "DESKTOP_MAC" ? 1.0 / macIpadAppScale : 1.0
  }

  /// 장면 좌표(iPad 점) 기준 최소 크기. Mac 외 기기는 nil(제한 없음).
  static func minimumSceneSize(deviceClass: String) -> CGSize? {
    guard deviceClass == "DESKTOP_MAC" else { return nil }
    return CGSize(
      width: (macMinimumWindowPt.width / macIpadAppScale).rounded(.up),
      height: (macMinimumWindowPt.height / macIpadAppScale).rounded(.up)
    )
  }
}
