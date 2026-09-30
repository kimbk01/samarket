import Foundation
import UIKit
import CommonCrypto
import JavaScriptCore

/// Parses IntroRuntimePackageV1 (13th) — scenes[].elements[] + assets
final class DibayIntroPackModel {
  /// ES JSON.stringify(sortKeys) — same algorithm as lib/intro/integrity.ts (Node).
  /// Foundation JSONSerialization number literals diverge (e.g. 0.82 → 0.8199…) and
  /// break packageIntegrity; JSCore matches the server seal without bypass.
  private static let integrityJSContext: JSContext = {
    let ctx = JSContext()!
    ctx.exceptionHandler = { _, exc in
      NSLog("[DibayIntroPack] integrity_js_error %@", exc?.toString() ?? "?")
    }
    ctx.evaluateScript(
      """
      function sortKeys(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(sortKeys);
        var out = {};
        Object.keys(value).sort().forEach(function (k) {
          out[k] = sortKeys(value[k]);
        });
        return out;
      }
      function canonicalizeFromRaw(raw) {
        var root = JSON.parse(raw);
        delete root.packageIntegrity;
        return JSON.stringify(sortKeys(root));
      }
      """
    )
    return ctx
  }()

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
    let backgroundMediaId: String?
    let backgroundFit: String?
    /// Flat SSOT: CUT, FADE, SLIDE_LEFT, SLIDE_RIGHT, SLIDE_UP, SLIDE_DOWN.
    let transitionType: String
    let transitionDurationMs: Int
    /// LEFT, RIGHT, UP, DOWN when transition is SLIDE_*; otherwise nil.
    let slideDirection: String?
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

  enum ParseError: Error, LocalizedError {
    case failure(String)
    var errorDescription: String? {
      switch self {
      case .failure(let message): return message
      }
    }
  }

  static func parseAndVerify(packURL: URL, expectedIntegrity: String) throws -> DibayIntroPackModel {
    let data = try Data(contentsOf: packURL)
    guard let raw = String(data: data, encoding: .utf8) else {
      throw ParseError.failure("PACK_NOT_UTF8")
    }
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw ParseError.failure("PACK_NOT_OBJECT")
    }
    let embedded = (root["packageIntegrity"] as? String) ?? ""
    if !expectedIntegrity.isEmpty && expectedIntegrity != embedded {
      throw ParseError.failure("PACK_INTEGRITY_MISMATCH")
    }
    let computed = sha256HexOfESCanonical(packUTF8: raw)
    if computed != embedded {
      throw ParseError.failure("PACK_INTEGRITY_COMPUTE_MISMATCH")
    }
    return try parseRoot(root, packageIntegrity: embedded)
  }

  /// SHA-256 of ES-canonical JSON (sans packageIntegrity) — matches server seal.
  static func sha256HexOfESCanonical(packUTF8 raw: String) -> String {
    let ctx = integrityJSContext
    ctx.setObject(raw, forKeyedSubscript: "raw" as NSString)
    guard let canon = ctx.evaluateScript("canonicalizeFromRaw(raw)")?.toString(),
          canon != "undefined", !canon.isEmpty
    else {
      return ""
    }
    return sha256Hex(of: Data(canon.utf8))
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
    var bgMediaId: String? = nil
    var bgFit: String? = nil
    if let background = s["background"] as? [String: Any] {
      let type = (background["type"] as? String) ?? ""
      if type == "COLOR" {
        bg = color(fromHex: (background["color"] as? String) ?? "#000000", fallback: .black)
      } else if type == "IMAGE" {
        let mediaId = (background["mediaId"] as? String) ?? ""
        if mediaId.isEmpty { throw ParseError.failure("BACKGROUND_IMAGE_MISSING_MEDIA") }
        let fit = (background["fit"] as? String) ?? "COVER"
        if fit != "CONTAIN" && fit != "COVER" {
          throw ParseError.failure("BACKGROUND_IMAGE_BAD_FIT:\(fit)")
        }
        bgMediaId = mediaId
        bgFit = fit
        if let colorHex = background["color"] as? String {
          bg = color(fromHex: colorHex, fallback: .black)
        }
      } else {
        throw ParseError.failure("UNSUPPORTED_BACKGROUND:\(type)")
      }
    }
    let trFields = parseTransitionFields(s["transition"])
    if let err = trFields.error {
      throw ParseError.failure(err)
    }
    let trType = trFields.type
    let trMs = trFields.durationMs
    let slideDirection = trFields.slideDirection
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
      backgroundMediaId: bgMediaId,
      backgroundFit: bgFit,
      transitionType: trType,
      transitionDurationMs: trMs,
      slideDirection: slideDirection,
      elements: elements
    )
  }

  private struct TransitionFields {
    var type: String = "CUT"
    var durationMs: Int = 0
    var slideDirection: String? = nil
    var error: String? = nil
  }

  private static func parseTransitionFields(_ raw: Any?) -> TransitionFields {
    var out = TransitionFields()
    guard let tr = raw as? [String: Any] else { return out }
    let rawType = (tr["type"] as? String) ?? "CUT"
    let durationMs = (tr["durationMs"] as? NSNumber)?.intValue ?? 0
    if rawType == "SLIDE" {
      let dir = (tr["direction"] as? String) ?? "DOWN"
      guard isSlideAxis(dir) else {
        out.error = "UNSUPPORTED_TRANSITION_DIRECTION:\(dir)"
        return out
      }
      out.type = "SLIDE_\(dir)"
      out.slideDirection = dir
      out.durationMs = durationMs
      return out
    }
    if rawType == "CUT" {
      out.type = "CUT"
      out.durationMs = 0
      return out
    }
    if rawType == "FADE" {
      out.type = "FADE"
      out.durationMs = durationMs
      return out
    }
    if rawType.hasPrefix("SLIDE_") {
      let axis = String(rawType.dropFirst("SLIDE_".count))
      guard isSlideAxis(axis) else {
        out.error = "UNSUPPORTED_TRANSITION:\(rawType)"
        return out
      }
      out.type = rawType
      out.slideDirection = axis
      out.durationMs = durationMs
      return out
    }
    out.error = "UNSUPPORTED_TRANSITION:\(rawType)"
    return out
  }

  private static func isSlideAxis(_ dir: String) -> Bool {
    dir == "LEFT" || dir == "RIGHT" || dir == "UP" || dir == "DOWN"
  }

  /// Legacy ENTER_TOP/BOTTOM only. SLIDE_* stay raw → UNSUPPORTED_MOTION (not ENTER_*).
  static func normalizeMotionType(_ raw: String) -> String {
    switch raw {
    case "ENTER_TOP": return "ENTER_UP"
    case "ENTER_BOTTOM": return "ENTER_DOWN"
    default: return raw
    }
  }

  private static func isCanonicalMotionType(_ type: String) -> Bool {
    type == "NONE" || type == "FADE_IN" || type == "ENTER_LEFT" || type == "ENTER_RIGHT"
      || type == "ENTER_UP" || type == "ENTER_DOWN" || type == "SCALE_IN"
  }

  private static func jsonBool(_ value: Any?, default defaultValue: Bool) -> Bool {
    if let b = value as? Bool { return b }
    if let n = value as? NSNumber { return n.boolValue }
    return defaultValue
  }

  private static func parseElement(_ el: [String: Any]) throws -> Element {
    let type = (el["type"] as? String) ?? ""
    guard type == "TEXT" || type == "IMAGE" || type == "LOGO" || type == "VIDEO" || type == "CTA" else {
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
      motionType = normalizeMotionType((motion["type"] as? String) ?? "NONE")
      motionStartMs = (motion["startMs"] as? NSNumber)?.intValue ?? 0
      motionDurationMs = (motion["durationMs"] as? NSNumber)?.intValue ?? 0
      if !isCanonicalMotionType(motionType) {
        throw ParseError.failure("UNSUPPORTED_MOTION:\(motionType)")
      }
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
        visible: jsonBool(el["visible"], default: true),
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
        visible: jsonBool(el["visible"], default: true),
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
    // IMAGE / LOGO / VIDEO — same mediaId + fit payload.
    let mediaId = (payload["mediaId"] as? String) ?? ""
    if mediaId.isEmpty {
      throw ParseError.failure(type == "VIDEO" ? "VIDEO_MISSING_MEDIA" : "IMAGE_MISSING_MEDIA")
    }
    let fit = (payload["fit"] as? String) ?? "CONTAIN"
    if fit != "CONTAIN" && fit != "COVER" {
      throw ParseError.failure(type == "VIDEO" ? "BAD_VIDEO_FIT" : "BAD_IMAGE_FIT")
    }
    return Element(
      id: (el["id"] as? String) ?? "",
      type: type,
      frame: frame,
      zIndex: (el["zIndex"] as? NSNumber)?.intValue ?? 0,
      visible: jsonBool(el["visible"], default: true),
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

  // Canonical JSON authority = lib/intro/integrity.ts (ES JSON.stringify(sortKeys)).
  // iOS verify path uses JavaScriptCore only (`sha256HexOfESCanonical`). Dead Foundation
  // canonicalize / jsonNumberLiteral removed — must not be reintroduced as a second seal path.

  static func sha256Hex(of data: Data) -> String {
    var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
    data.withUnsafeBytes { ptr in
      _ = CC_SHA256(ptr.baseAddress, CC_LONG(data.count), &digest)
    }
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}
