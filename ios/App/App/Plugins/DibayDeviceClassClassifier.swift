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

  static func classify(idiom: UIUserInterfaceIdiom = UIDevice.current.userInterfaceIdiom) -> Result {
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
