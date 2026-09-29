import Foundation
import UIKit
import CommonCrypto

/// Parses IntroRuntimePackageV1 (13th) — scenes[].elements[]
final class DibayIntroPackModel {
  struct Frame {
    let x: CGFloat
    let y: CGFloat
    let w: CGFloat
    let h: CGFloat
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
      scenes: scenes
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
        throw ParseError.failure("BACKGROUND_IMAGE_NOT_V0")
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
    if type == "IMAGE" || type == "LOGO" || type == "CTA" {
      throw ParseError.failure("ELEMENT_NOT_V0:\(type)")
    }
    guard type == "TEXT" else { throw ParseError.failure("UNSUPPORTED_ELEMENT:\(type)") }
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
      throw ParseError.failure("TEXT_MISSING_PAYLOAD")
    }
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
      weight: (payload["weight"] as? String) ?? "bold"
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
      // Distinguish Bool from number
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
    let data = try? JSONSerialization.data(withJSONObject: s, options: [])
    if let data, let out = String(data: data, encoding: .utf8) { return out }
    return "\"\""
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
}
