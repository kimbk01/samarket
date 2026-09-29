import Foundation
import UIKit
import CryptoKit

/**
 * Parses canonical local Active Pack JSON into renderable scene model.
 * Same semantics as Android. Does not hardcode Scene1. Unsupported layer → fail.
 */
final class DibayIntroPackModel {
  let packId: String
  let publishedRevisionId: String
  let packIntegrity: String
  let compositionW: CGFloat
  let compositionH: CGFloat
  let scenes: [Scene]
  let assetsByMediaRef: [String: Asset]

  struct Asset {
    let sealedAssetId: String
    let sealedIntegrity: String
    let relativePackPath: String
    let mediaRefId: String
    let mime: String
  }

  struct Frame {
    let x: CGFloat
    let y: CGFloat
    let w: CGFloat
    let h: CGFloat
  }

  struct Layer {
    let layerId: String
    let type: String
    let frame: Frame
    let visible: Bool
    let opacity: CGFloat
    let zIndex: Int
    let mediaRefId: String?
    let fit: String
    let surface: String
    let textContent: String?
    let fontAssetId: String?
    let fontSize: CGFloat
    let lineHeight: CGFloat
    let maxLines: Int
    let align: String
    let color: UIColor
    let ctaLabel: String?
    let ctaActionType: String?
    let ctaBgColor: UIColor
    let ctaCornerRadius: CGFloat
    /// Semantic motion — NONE when legacy pack omits field.
    let motionType: String
    let motionStartMs: Int
    let motionDurationMs: Int
  }

  struct Transition {
    let type: String
    let durationMs: Int
  }

  struct Scene {
    let sceneId: String
    let name: String
    let durationMs: Int
    let backgroundColor: UIColor
    let transitionAfter: Transition?
    let layers: [Layer]
  }

  struct ParseResult {
    let ok: Bool
    let failureCode: String?
    let model: DibayIntroPackModel?
  }

  init(
    packId: String,
    publishedRevisionId: String,
    packIntegrity: String,
    compositionW: CGFloat,
    compositionH: CGFloat,
    scenes: [Scene],
    assetsByMediaRef: [String: Asset]
  ) {
    self.packId = packId
    self.publishedRevisionId = publishedRevisionId
    self.packIntegrity = packIntegrity
    self.compositionW = compositionW
    self.compositionH = compositionH
    self.scenes = scenes
    self.assetsByMediaRef = assetsByMediaRef
  }

  static func parseAndVerify(packURL: URL, expectedIntegrity: String?) throws -> ParseResult {
    let data = try Data(contentsOf: packURL)
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return ParseResult(ok: false, failureCode: "PACK_JSON_INVALID", model: nil)
    }
    let embedded = root["packIntegrity"] as? String ?? ""
    if let expected = expectedIntegrity, !expected.isEmpty, expected != embedded {
      return ParseResult(ok: false, failureCode: "PACK_INTEGRITY_MISMATCH", model: nil)
    }
    return try parseRoot(root, packIntegrity: embedded.isEmpty ? (expectedIntegrity ?? "") : embedded)
  }

  private static func parseRoot(_ root: [String: Any], packIntegrity: String) throws -> ParseResult {
    let packId = root["packId"] as? String ?? ""
    let publishedRevisionId = root["publishedRevisionId"] as? String ?? ""
    guard let document = root["document"] as? [String: Any] else {
      return ParseResult(ok: false, failureCode: "PACK_MISSING_DOCUMENT", model: nil)
    }
    var CaW: CGFloat = 9
    var CaH: CGFloat = 16
    if let settings = document["settings"] as? [String: Any],
       let aspect = settings["compositionAspect"] as? [String: Any] {
      CaW = cgFloat(aspect["w"], 9)
      CaH = cgFloat(aspect["h"], 16)
    }

    var assets: [String: Asset] = [:]
    if let assetArr = root["assets"] as? [[String: Any]] {
      for a in assetArr {
        let asset = Asset(
          sealedAssetId: a["sealedAssetId"] as? String ?? "",
          sealedIntegrity: a["sealedIntegrity"] as? String ?? "",
          relativePackPath: a["relativePackPath"] as? String ?? "",
          mediaRefId: a["mediaRefId"] as? String ?? "",
          mime: a["mime"] as? String ?? ""
        )
        if !asset.mediaRefId.isEmpty {
          assets[asset.mediaRefId] = asset
        }
      }
    }

    guard let sceneArr = document["scenes"] as? [[String: Any]], !sceneArr.isEmpty else {
      return ParseResult(ok: false, failureCode: "PACK_NO_SCENES", model: nil)
    }
    var scenes: [Scene] = []
    for s in sceneArr {
      let sceneParse = try parseScene(s, assets: assets)
      if !sceneParse.ok { return sceneParse }
      if let sc = sceneParse.model?.scenes.first {
        scenes.append(sc)
      }
    }

    let model = DibayIntroPackModel(
      packId: packId,
      publishedRevisionId: publishedRevisionId,
      packIntegrity: packIntegrity,
      compositionW: CaW,
      compositionH: CaH,
      scenes: scenes,
      assetsByMediaRef: assets
    )
    return ParseResult(ok: true, failureCode: nil, model: model)
  }

  private static func parseScene(_ s: [String: Any], assets: [String: Asset]) throws -> ParseResult {
    let sceneId = s["sceneId"] as? String ?? ""
    let name = s["name"] as? String ?? ""
    let durationMs = intVal(s["durationMs"], 0)
    var bgColor = UIColor.black
    if let bg = s["background"] as? [String: Any] {
      let type = bg["type"] as? String ?? ""
      if type != "SOLID" {
        return ParseResult(ok: false, failureCode: "UNSUPPORTED_BACKGROUND:\(type)", model: nil)
      }
      bgColor = colorToUIColor(bg["color"], fallback: .black)
    }
    var transition: Transition?
    if let t = s["transitionAfter"] as? [String: Any] {
      let type = t["type"] as? String ?? ""
      if type != "CUT" && type != "FADE" && type != "SLIDE" {
        return ParseResult(ok: false, failureCode: "UNSUPPORTED_TRANSITION:\(type)", model: nil)
      }
      transition = Transition(type: type, durationMs: intVal(t["durationMs"], 0))
    }
    var layers: [Layer] = []
    if let layerArr = s["layers"] as? [[String: Any]] {
      for l in layerArr {
        let lr = try parseLayer(l, assets: assets)
        if !lr.ok { return lr }
        if let layer = lr.model?.scenes.first?.layers.first {
          layers.append(layer)
        }
      }
    }
    layers.sort { $0.zIndex < $1.zIndex }
    let scene = Scene(
      sceneId: sceneId,
      name: name,
      durationMs: durationMs,
      backgroundColor: bgColor,
      transitionAfter: transition,
      layers: layers
    )
    let stub = DibayIntroPackModel(
      packId: "", publishedRevisionId: "", packIntegrity: "",
      compositionW: 9, compositionH: 16, scenes: [scene], assetsByMediaRef: assets
    )
    return ParseResult(ok: true, failureCode: nil, model: stub)
  }

  private static func parseLayer(_ l: [String: Any], assets: [String: Asset]) throws -> ParseResult {
    let type = l["type"] as? String ?? ""
    if type != "IMAGE" && type != "LOGO" && type != "TEXT" && type != "CTA" {
      return ParseResult(ok: false, failureCode: "UNSUPPORTED_LAYER:\(type)", model: nil)
    }
    guard let frameJson = l["frame"] as? [String: Any] else {
      return ParseResult(ok: false, failureCode: "LAYER_MISSING_FRAME", model: nil)
    }
    let frame = Frame(
      x: cgFloat(frameJson["x"], 0),
      y: cgFloat(frameJson["y"], 0),
      w: cgFloat(frameJson["w"], 0),
      h: cgFloat(frameJson["h"], 0)
    )
    let visible = boolVal(l["visible"], true)
    let opacity = cgFloat(l["opacity"], 1)
    let zIndex = intVal(l["zIndex"], 0)
    var mediaRefId = l["mediaRefId"] as? String
    let fit = l["fit"] as? String ?? "CONTAIN"
    let surface = l["surface"] as? String ?? "CONTENT"
    var textContent: String?
    var fontAssetId: String?
    var fontSize: CGFloat = 0.05
    var lineHeight: CGFloat = 1.25
    var maxLines = 2
    var align = "CENTER"
    var color: UIColor = .white
    var ctaLabel: String?
    var ctaActionType: String?
    var ctaBgColor: UIColor = .clear
    var ctaCornerRadius: CGFloat = 0
    var motionType = "NONE"
    var motionStartMs = 0
    var motionDurationMs = 0

    if let motion = l["motion"] as? [String: Any] {
      let raw = motion["type"] as? String ?? "NONE"
      motionType = raw.isEmpty ? "NONE" : raw
      motionStartMs = max(0, intVal(motion["startMs"], 0))
      motionDurationMs = max(0, intVal(motion["durationMs"], 0))
      if motionType == "NONE" {
        motionStartMs = 0
        motionDurationMs = 0
      }
    }

    if type == "IMAGE" || type == "LOGO" {
      if mediaRefId == nil || mediaRefId!.isEmpty {
        return ParseResult(ok: false, failureCode: "LAYER_MISSING_MEDIA:\(type)", model: nil)
      }
      if assets[mediaRefId!] == nil {
        return ParseResult(ok: false, failureCode: "LAYER_MEDIA_NOT_IN_PACK:\(mediaRefId!)", model: nil)
      }
    }
    if type == "TEXT" {
      textContent = l["content"] as? String ?? ""
      guard let font = l["font"] as? [String: Any] else {
        return ParseResult(ok: false, failureCode: "TEXT_MISSING_FONT", model: nil)
      }
      if (font["family"] as? String ?? "") != "Pretendard" {
        return ParseResult(ok: false, failureCode: "TEXT_NON_PRETENDARD", model: nil)
      }
      fontAssetId = font["assetId"] as? String ?? ""
      fontSize = cgFloat(l["fontSize"], 0.05)
      lineHeight = cgFloat(l["lineHeight"], 1.25)
      maxLines = intVal(l["maxLines"], 2)
      align = l["align"] as? String ?? "CENTER"
      color = colorToUIColor(l["color"], fallback: .white)
    }
    if type == "CTA" {
      ctaLabel = l["label"] as? String ?? ""
      if let action = l["action"] as? [String: Any] {
        ctaActionType = action["type"] as? String ?? ""
      }
      if let text = l["text"] as? [String: Any] {
        if let font = text["font"] as? [String: Any] {
          fontAssetId = font["assetId"] as? String ?? ""
        }
        fontSize = cgFloat(text["fontSize"], 0.035)
        align = text["align"] as? String ?? "CENTER"
        color = colorToUIColor(text["color"], fallback: .white)
      }
      if let bg = l["background"] as? [String: Any] {
        ctaBgColor = colorToUIColor(bg["color"], fallback: .clear)
        ctaCornerRadius = cgFloat(bg["cornerRadius"], 0)
      }
    }

    let layer = Layer(
      layerId: l["layerId"] as? String ?? "",
      type: type,
      frame: frame,
      visible: visible,
      opacity: opacity,
      zIndex: zIndex,
      mediaRefId: mediaRefId,
      fit: fit,
      surface: surface,
      textContent: textContent,
      fontAssetId: fontAssetId,
      fontSize: fontSize,
      lineHeight: lineHeight,
      maxLines: maxLines,
      align: align,
      color: color,
      ctaLabel: ctaLabel,
      ctaActionType: ctaActionType,
      ctaBgColor: ctaBgColor,
      ctaCornerRadius: ctaCornerRadius,
      motionType: motionType,
      motionStartMs: motionStartMs,
      motionDurationMs: motionDurationMs
    )
    let stubScene = Scene(
      sceneId: "", name: "", durationMs: 0, backgroundColor: .black,
      transitionAfter: nil, layers: [layer]
    )
    let stub = DibayIntroPackModel(
      packId: "", publishedRevisionId: "", packIntegrity: "",
      compositionW: 9, compositionH: 16, scenes: [stubScene], assetsByMediaRef: assets
    )
    return ParseResult(ok: true, failureCode: nil, model: stub)
  }

  static func colorToUIColor(_ color: Any?, fallback: UIColor) -> UIColor {
    if let c = color as? [String: Any] {
      let a = cgFloat(c["a"], 1)
      let r = cgFloat(c["r"], 0)
      let g = cgFloat(c["g"], 0)
      let b = cgFloat(c["b"], 0)
      return UIColor(red: r, green: g, blue: b, alpha: a)
    }
    if let hex = color as? String {
      return UIColor(dibayHex: hex) ?? fallback
    }
    return fallback
  }

  static func verifyAssetFile(_ url: URL, sealedIntegrity: String) -> Bool {
    guard let data = try? Data(contentsOf: url) else { return false }
    let hex = sha256Hex(data)
    let expected = sealedIntegrity.hasPrefix("sha256:")
      ? String(sealedIntegrity.dropFirst("sha256:".count))
      : sealedIntegrity
    return expected.lowercased() == hex.lowercased()
  }

  static func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static func cgFloat(_ v: Any?, _ fallback: CGFloat) -> CGFloat {
    if let n = v as? NSNumber { return CGFloat(truncating: n) }
    if let d = v as? Double { return CGFloat(d) }
    if let i = v as? Int { return CGFloat(i) }
    return fallback
  }

  private static func intVal(_ v: Any?, _ fallback: Int) -> Int {
    if let n = v as? NSNumber { return n.intValue }
    if let i = v as? Int { return i }
    return fallback
  }

  private static func boolVal(_ v: Any?, _ fallback: Bool) -> Bool {
    if let b = v as? Bool { return b }
    return fallback
  }
}

private extension UIColor {
  convenience init?(dibayHex: String) {
    var s = dibayHex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6 || s.count == 8, let val = UInt64(s, radix: 16) else { return nil }
    if s.count == 6 {
      self.init(
        red: CGFloat((val >> 16) & 0xff) / 255,
        green: CGFloat((val >> 8) & 0xff) / 255,
        blue: CGFloat(val & 0xff) / 255,
        alpha: 1
      )
    } else {
      self.init(
        red: CGFloat((val >> 24) & 0xff) / 255,
        green: CGFloat((val >> 16) & 0xff) / 255,
        blue: CGFloat((val >> 8) & 0xff) / 255,
        alpha: CGFloat(val & 0xff) / 255
      )
    }
  }
}
