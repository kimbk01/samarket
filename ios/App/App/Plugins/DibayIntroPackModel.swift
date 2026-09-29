import Foundation
import UIKit
import CommonCrypto

/// Parses IntroRuntimePackageV1 (13th) — scenes[].elements[] + assets
final class DibayIntroPackModel {
  struct Frame {
    let x: CGFloat
    let y: CGFloat
    let w: CGFloat
    let h: CGFloat
  }

  struct Asset {
    let mediaId: String
    let relativePath: String
    let integrity: String
    let width: Int
    let height: Int
    let format: String
  }

  struct Element {
    let id: String
    let type: String
    let frame: Frame
    let zIndex: Int
    let visible: Bool
    let opacity: CGFloat
    let text: String
    let textColor: UIColor
    let fontSizeNorm: CGFloat
    let align: String
    let weight: String
    let mediaId: String?
    let fit: String?
    let ctaLabel: String?
    let ctaActionType: String?
    let ctaDestination: String?
    let ctaBg: UIColor
    let ctaText: UIColor
    let motionType: String
    let motionStartMs: Int
    let motionDurationMs: Int
  }

  struct Scene {
    let id: String
    let durationMs: Int
    let backgroundColor: UIColor
    let transitionType: String
    let transitionDurationMs: Int
    let elements: [Element]
  }

  let packageId: String
  let releaseId: String
  let packageIntegrity: String
  let compositionW: CGFloat
  let compositionH: CGFloat
  let scenes: [Scene]
  let assetsByMediaId: [String: Asset]

  private init(
    packageId: String,
    releaseId: String,
    packageIntegrity: String,
    compositionW: CGFloat,
    compositionH: CGFloat,
    scenes: [Scene],
    assetsByMediaId: [String: Asset]
  ) {
    self.packageId = packageId
    self.releaseId = releaseId
    self.packageIntegrity = packageIntegrity
    self.compositionW = compositionW
    self.compositionH = compositionH
    self.scenes = scenes
    self.assetsByMediaId = assetsByMediaId
  }

  enum ParseError: Error {
    case failure(String)
  }

  static func parseAndVerify(packURL: URL, expectedIntegrity: String) throws -> DibayIntroPackModel {
    let data = try Data(contentsOf: packURL)
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw ParseError.failure("PACK_NOT_OBJECT")
    }
    let embedded = (root["packageIntegrity"] as? String) ?? ""
    if !expectedIntegrity.isEmpty && expectedIntegrity != embedded {
      throw ParseError.failure("PACK_INTEGRITY_MISMATCH")
    }
    var forHash = root
    forHash.removeValue(forKey: "packageIntegrity")
    let computed = sha256Hex(ofCanonical: forHash)
    if computed != embedded {
      throw ParseError.failure("PACK_INTEGRITY_COMPUTE_MISMATCH")
    }
    return try parseRoot(root, packageIntegrity: embedded)
  }

  private static func parseRoot(_ root: [String: Any], packageIntegrity: String) throws -> DibayIntroPackModel {
    guard let packageId = root["packageId"] as? String, !packageId.isEmpty,
          let releaseId = root["releaseId"] as? String, !releaseId.isEmpty
    else {
      throw ParseError.failure("PACK_MISSING_IDS")
    }
    var CaW: CGFloat = 9
    var CaH: CGFloat = 16
    if let aspect = root["compositionAspect"] as? [String: Any] {
      CaW = CGFloat((aspect["w"] as? NSNumber)?.doubleValue ?? 9)
      CaH = CGFloat((aspect["h"] as? NSNumber)?.doubleValue ?? 16)
    }
    var assets: [String: Asset] = [:]
    if let assetsObj = root["assets"] as? [String: Any] {
      for (mediaId, raw) in assetsObj {
        guard let a = raw as? [String: Any] else { continue }
        assets[mediaId] = Asset(
          mediaId: mediaId,
          relativePath: (a["relativePath"] as? String) ?? "",
          integrity: (a["integrity"] as? String) ?? "",
          width: (a["width"] as? NSNumber)?.intValue ?? 0,
          height: (a["height"] as? NSNumber)?.intValue ?? 0,
          format: (a["format"] as? String) ?? ""
        )
      }
    }
    guard let sceneArr = root["scenes"] as? [[String: Any]], !sceneArr.isEmpty else {
      throw ParseError.failure("PACK_NO_SCENES")
    }
    var scenes: [Scene] = []
    for s in sceneArr {
      scenes.append(try parseScene(s))
    }
    return DibayIntroPackModel(
      packageId: packageId,
      releaseId: releaseId,
      packageIntegrity: packageIntegrity,
      compositionW: CaW,
      compositionH: CaH,
      scenes: scenes,
      assetsByMediaId: assets
    )
  }

  private static func parseScene(_ s: [String: Any]) throws -> Scene {
    let id = (s["id"] as? String) ?? ""
    let durationMs = (s["durationMs"] as? NSNumber)?.intValue ?? 0
    if durationMs < 100 { throw ParseError.failure("SCENE_DURATION") }
    var bg = UIColor.black
    if let background = s["background"] as? [String: Any] {
      let type = (background["type"] as? String) ?? ""
      if type == "COLOR" {
        bg = color(fromHex: (background["color"] as? String) ?? "#000000", fallback: .black)
      } else if type == "IMAGE" {
        throw ParseError.failure("BACKGROUND_IMAGE_NOT_YET")
      } else {
        throw ParseError.failure("UNSUPPORTED_BACKGROUND:\(type)")
      }
    }
    var trType = "CUT"
    var trMs = 0
    if let tr = s["transition"] as? [String: Any] {
      trType = (tr["type"] as? String) ?? "CUT"
      trMs = (tr["durationMs"] as? NSNumber)?.intValue ?? 0
      if trType != "CUT" && trType != "FADE" && trType != "SLIDE" {
        throw ParseError.failure("UNSUPPORTED_TRANSITION:\(trType)")
      }
    }
    var elements: [Element] = []
    if let elArr = s["elements"] as? [[String: Any]] {
      for el in elArr {
        elements.append(try parseElement(el))
      }
    }
    elements.sort { $0.zIndex < $1.zIndex }
    return Scene(
      id: id,
      durationMs: durationMs,
      backgroundColor: bg,
      transitionType: trType,
      transitionDurationMs: trMs,
      elements: elements
    )
  }

  private static func parseElement(_ el: [String: Any]) throws -> Element {
    let type = (el["type"] as? String) ?? ""
    guard type == "TEXT" || type == "IMAGE" || type == "LOGO" || type == "CTA" else {
      throw ParseError.failure("UNSUPPORTED_ELEMENT:\(type)")
    }
    guard let frameJson = el["frame"] as? [String: Any] else {
      throw ParseError.failure("ELEMENT_MISSING_FRAME")
    }
    let frame = Frame(
      x: CGFloat((frameJson["x"] as? NSNumber)?.doubleValue ?? 0),
      y: CGFloat((frameJson["y"] as? NSNumber)?.doubleValue ?? 0),
      w: CGFloat((frameJson["w"] as? NSNumber)?.doubleValue ?? 0),
      h: CGFloat((frameJson["h"] as? NSNumber)?.doubleValue ?? 0)
    )
    guard let payload = el["payload"] as? [String: Any] else {
      throw ParseError.failure("MISSING_PAYLOAD")
    }
    var motionType = "NONE"
    var motionStartMs = 0
    var motionDurationMs = 0
    if let motion = el["motion"] as? [String: Any] {
      motionType = (motion["type"] as? String) ?? "NONE"
      motionStartMs = (motion["startMs"] as? NSNumber)?.intValue ?? 0
      motionDurationMs = (motion["durationMs"] as? NSNumber)?.intValue ?? 0
    }
    if type == "TEXT" {
      let text = (payload["text"] as? String) ?? ""
      if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        throw ParseError.failure("EMPTY_TEXT")
      }
      return Element(
        id: (el["id"] as? String) ?? "",
        type: type,
        frame: frame,
        zIndex: (el["zIndex"] as? NSNumber)?.intValue ?? 0,
        visible: (el["visible"] as? Bool) ?? true,
        opacity: CGFloat((el["opacity"] as? NSNumber)?.doubleValue ?? 1),
        text: text,
        textColor: color(fromHex: (payload["color"] as? String) ?? "#FFFFFF", fallback: .white),
        fontSizeNorm: CGFloat((payload["fontSizeNorm"] as? NSNumber)?.doubleValue ?? 0.045),
        align: (payload["align"] as? String) ?? "center",
        weight: (payload["weight"] as? String) ?? "bold",
        mediaId: nil,
        fit: nil,
        ctaLabel: nil,
        ctaActionType: nil,
        ctaDestination: nil,
        ctaBg: .clear,
        ctaText: .clear,
        motionType: motionType,
        motionStartMs: motionStartMs,
        motionDurationMs: motionDurationMs
      )
    }
    if type == "CTA" {
      let label = (payload["label"] as? String) ?? ""
      if label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        throw ParseError.failure("EMPTY_CTA_LABEL")
      }
      guard let action = payload["action"] as? [String: Any] else {
        throw ParseError.failure("CTA_MISSING_ACTION")
      }
      let actionType = (action["type"] as? String) ?? ""
      if actionType != "NEXT_SCENE" && actionType != "FINISH_INTRO" && actionType != "INTERNAL_DESTINATION" {
        throw ParseError.failure("CTA_BAD_ACTION:\(actionType)")
      }
      let destination = (action["destination"] as? String) ?? ""
      if actionType == "INTERNAL_DESTINATION" && destination.isEmpty {
        throw ParseError.failure("CTA_MISSING_DESTINATION")
      }
      return Element(
        id: (el["id"] as? String) ?? "",
        type: type,
        frame: frame,
        zIndex: (el["zIndex"] as? NSNumber)?.intValue ?? 0,
        visible: (el["visible"] as? Bool) ?? true,
        opacity: CGFloat((el["opacity"] as? NSNumber)?.doubleValue ?? 1),
        text: "",
        textColor: .clear,
        fontSizeNorm: 0,
        align: "center",
        weight: "bold",
        mediaId: nil,
        fit: nil,
        ctaLabel: label,
        ctaActionType: actionType,
        ctaDestination: destination,
        ctaBg: color(fromHex: (payload["backgroundColor"] as? String) ?? "#4F46E5", fallback: UIColor(red: 0.31, green: 0.275, blue: 0.898, alpha: 1)),
        ctaText: color(fromHex: (payload["textColor"] as? String) ?? "#FFFFFF", fallback: .white),
        motionType: motionType,
        motionStartMs: motionStartMs,
        motionDurationMs: motionDurationMs
      )
    }
    let mediaId = (payload["mediaId"] as? String) ?? ""
    if mediaId.isEmpty { throw ParseError.failure("IMAGE_MISSING_MEDIA") }
    let fit = (payload["fit"] as? String) ?? "CONTAIN"
    if fit != "CONTAIN" && fit != "COVER" {
      throw ParseError.failure("BAD_IMAGE_FIT")
    }
    return Element(
      id: (el["id"] as? String) ?? "",
      type: type,
      frame: frame,
      zIndex: (el["zIndex"] as? NSNumber)?.intValue ?? 0,
      visible: (el["visible"] as? Bool) ?? true,
      opacity: CGFloat((el["opacity"] as? NSNumber)?.doubleValue ?? 1),
      text: "",
      textColor: .clear,
      fontSizeNorm: 0,
      align: "center",
      weight: "regular",
      mediaId: mediaId,
      fit: fit,
      ctaLabel: nil,
      ctaActionType: nil,
      ctaDestination: nil,
      ctaBg: .clear,
      ctaText: .clear,
      motionType: motionType,
      motionStartMs: motionStartMs,
      motionDurationMs: motionDurationMs
    )
  }

  static func color(fromHex hex: String, fallback: UIColor) -> UIColor {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if h.hasPrefix("#") { h = String(h.dropFirst()) }
    var value: UInt64 = 0
    guard Scanner(string: h).scanHexInt64(&value) else { return fallback }
    if h.count == 6 {
      return UIColor(
        red: CGFloat((value >> 16) & 0xFF) / 255,
        green: CGFloat((value >> 8) & 0xFF) / 255,
        blue: CGFloat(value & 0xFF) / 255,
        alpha: 1
      )
    }
    if h.count == 8 {
      return UIColor(
        red: CGFloat((value >> 24) & 0xFF) / 255,
        green: CGFloat((value >> 16) & 0xFF) / 255,
        blue: CGFloat((value >> 8) & 0xFF) / 255,
        alpha: CGFloat(value & 0xFF) / 255
      )
    }
    return fallback
  }

  /// Canonical JSON with sorted keys — matches lib/intro/integrity.ts
  static func canonicalize(_ value: Any) -> String {
    if value is NSNull { return "null" }
    if let s = value as? String {
      return jsonStringLiteral(s)
    }
    if let n = value as? NSNumber {
      if CFGetTypeID(n) == CFBooleanGetTypeID() {
        return n.boolValue ? "true" : "false"
      }
      return n.stringValue
    }
    if let arr = value as? [Any] {
      let parts = arr.map { canonicalize($0) }
      return "[" + parts.joined(separator: ",") + "]"
    }
    if let dict = value as? [String: Any] {
      let keys = dict.keys.sorted()
      let parts = keys.map { key in
        jsonStringLiteral(key) + ":" + canonicalize(dict[key]!)
      }
      return "{" + parts.joined(separator: ",") + "}"
    }
    return "null"
  }

  private static func jsonStringLiteral(_ s: String) -> String {
    // Match JSON.stringify — do NOT escape solidus `/` (Foundation JSONSerialization may).
    var out = "\""
    for ch in s.unicodeScalars {
      switch ch {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\u{8}": out += "\\b"
      case "\u{c}": out += "\\f"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default:
        if ch.value < 0x20 {
          out += String(format: "\\u%04x", ch.value)
        } else {
          out.append(Character(ch))
        }
      }
    }
    out += "\""
    return out
  }

  static func sha256Hex(ofCanonical value: Any) -> String {
    let canonical = canonicalize(value)
    let bytes = Array(canonical.utf8)
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    bytes.withUnsafeBytes { ptr in
      _ = CC_SHA256(ptr.baseAddress, CC_LONG(bytes.count), &digest)
    }
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  static func sha256Hex(of data: Data) -> String {
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes { ptr in
      _ = CC_SHA256(ptr.baseAddress, CC_LONG(data.count), &digest)
    }
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}
