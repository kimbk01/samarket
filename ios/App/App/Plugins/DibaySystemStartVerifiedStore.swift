import Foundation
import UIKit

/// Layer B local authority — ONE verified System Start generation.
final class DibaySystemStartVerifiedStore {
  private let base: URL

  init() {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    base = docs.appendingPathComponent("dibay-system-start", isDirectory: true)
  }

  var verifiedDir: URL { base.appendingPathComponent("verified", isDirectory: true) }
  var verifiedConfigURL: URL { verifiedDir.appendingPathComponent("config.json") }
  var verifiedMetaURL: URL { verifiedDir.appendingPathComponent("meta.json") }
  var livePointerURL: URL { base.appendingPathComponent("live-pointer.json") }
  var stagingDir: URL { base.appendingPathComponent("staging", isDirectory: true) }

  func readVerifiedMetaOrNull() -> [String: Any]? {
    guard let data = try? Data(contentsOf: verifiedMetaURL),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return obj
  }

  func readVerifiedConfigOrNull() -> DibaySystemStartConfig? {
    guard let meta = readVerifiedMetaOrNull(),
          let generationId = meta["generationId"] as? String, !generationId.isEmpty,
          let integrity = meta["packageIntegrity"] as? String, !integrity.isEmpty,
          hasVerifiedMatching(generationId: generationId, packageIntegrity: integrity),
          let data = try? Data(contentsOf: verifiedConfigURL)
    else { return nil }
    return DibaySystemStartConfig.parse(
      configBytes: data, expectedGenerationId: generationId, packageIntegrity: integrity)
  }

  func hasVerifiedMatching(generationId: String, packageIntegrity: String) -> Bool {
    guard let meta = readVerifiedMetaOrNull(),
          (meta["generationId"] as? String) == generationId,
          (meta["packageIntegrity"] as? String) == packageIntegrity,
          FileManager.default.fileExists(atPath: verifiedConfigURL.path),
          let data = try? Data(contentsOf: verifiedConfigURL)
    else { return false }
    let hex = DibayIntroPackModel.sha256Hex(of: data)
    guard hex.caseInsensitiveCompare(packageIntegrity) == .orderedSame else { return false }
    guard let parsed = DibaySystemStartConfig.parse(
      configBytes: data, expectedGenerationId: generationId, packageIntegrity: packageIntegrity)
    else { return false }
    for asset in parsed.assetsByMediaId.values {
      let f = verifiedDir.appendingPathComponent(asset.relativePath)
      if !FileManager.default.fileExists(atPath: f.path) { return false }
    }
    return true
  }

  func writeLivePointer(_ live: [String: Any]) throws {
    try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    let data = try JSONSerialization.data(withJSONObject: live, options: [])
    try data.write(to: livePointerURL, options: .atomic)
  }

  func readLivePointerOrNull() -> [String: Any]? {
    guard let data = try? Data(contentsOf: livePointerURL),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return obj
  }

  func atomicCommitVerified(
    configBytes: Data,
    assetBytesByRelativePath: [String: Data],
    generationId: String,
    packageIntegrity: String
  ) throws {
    let fm = FileManager.default
    try? fm.removeItem(at: stagingDir)
    try fm.createDirectory(at: stagingDir, withIntermediateDirectories: true)
    let stagingConfig = stagingDir.appendingPathComponent("config.json")
    try configBytes.write(to: stagingConfig, options: .atomic)
    let hex = DibayIntroPackModel.sha256Hex(of: configBytes)
    guard hex.caseInsensitiveCompare(packageIntegrity) == .orderedSame else {
      try? fm.removeItem(at: stagingDir)
      throw NSError(domain: "DibaySystemStart", code: 1, userInfo: [NSLocalizedDescriptionKey: "config_integrity_mismatch"])
    }
    guard let parsed = DibaySystemStartConfig.parse(
      configBytes: configBytes, expectedGenerationId: generationId, packageIntegrity: packageIntegrity)
    else {
      try? fm.removeItem(at: stagingDir)
      throw NSError(domain: "DibaySystemStart", code: 2, userInfo: [NSLocalizedDescriptionKey: "config_parse_failed"])
    }
    for (rel, bytes) in assetBytesByRelativePath {
      let dest = stagingDir.appendingPathComponent(rel)
      try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
      try bytes.write(to: dest, options: .atomic)
    }
    for asset in parsed.assetsByMediaId.values {
      let f = stagingDir.appendingPathComponent(asset.relativePath)
      guard fm.fileExists(atPath: f.path) else {
        try? fm.removeItem(at: stagingDir)
        throw NSError(domain: "DibaySystemStart", code: 3, userInfo: [NSLocalizedDescriptionKey: "asset_missing:\(asset.mediaId)"])
      }
      if asset.integrity.hasPrefix("sha256:") {
        let data = try Data(contentsOf: f)
        let assetHex = DibayIntroPackModel.sha256Hex(of: data)
        let expected = String(asset.integrity.dropFirst("sha256:".count))
        if assetHex.caseInsensitiveCompare(expected) != .orderedSame {
          try? fm.removeItem(at: stagingDir)
          throw NSError(domain: "DibaySystemStart", code: 4, userInfo: [NSLocalizedDescriptionKey: "asset_integrity:\(asset.mediaId)"])
        }
      }
    }
    let meta: [String: Any] = [
      "generationId": generationId,
      "packageIntegrity": packageIntegrity,
      "committedAt": Date().timeIntervalSince1970 * 1000,
    ]
    let stagingMeta = stagingDir.appendingPathComponent("meta.json")
    try JSONSerialization.data(withJSONObject: meta, options: []).write(to: stagingMeta, options: .atomic)

    let verifiedTmp = base.appendingPathComponent("verified.tmp", isDirectory: true)
    try? fm.removeItem(at: verifiedTmp)
    try fm.moveItem(at: stagingDir, to: verifiedTmp)

    let verifiedOld = base.appendingPathComponent("verified.old", isDirectory: true)
    try? fm.removeItem(at: verifiedOld)
    if fm.fileExists(atPath: verifiedDir.path) {
      try fm.moveItem(at: verifiedDir, to: verifiedOld)
    }
    do {
      try fm.moveItem(at: verifiedTmp, to: verifiedDir)
    } catch {
      if fm.fileExists(atPath: verifiedOld.path) {
        try? fm.moveItem(at: verifiedOld, to: verifiedDir)
      }
      throw error
    }
    try? fm.removeItem(at: verifiedOld)
    NSLog("[DibaySystemStartStore] atomic_commit ok generationId=%@", generationId)
  }

  func quarantineVerified(reason: String) {
    let q = base.appendingPathComponent("quarantine-\(Int(Date().timeIntervalSince1970 * 1000))", isDirectory: true)
    if FileManager.default.fileExists(atPath: verifiedDir.path) {
      try? FileManager.default.moveItem(at: verifiedDir, to: q)
      NSLog("[DibaySystemStartStore] quarantine reason=%@", reason)
    }
  }
}

/// Parsed SystemStartLiveConfig (Layer B).
struct DibaySystemStartConfig {
  struct Asset {
    let mediaId: String
    let relativePath: String
    let integrity: String
  }

  let generationId: String
  let packageIntegrity: String
  let backgroundColor: UIColor
  let backgroundImageMediaId: String?
  let brandAssetEnabled: Bool
  let brandAssetMediaId: String?
  let brandSizeNorm: CGFloat
  let brandXNorm: CGFloat
  let brandYNorm: CGFloat
  let minVisibleMs: Int
  let assetsByMediaId: [String: Asset]

  static func parse(
    configBytes: Data,
    expectedGenerationId: String?,
    packageIntegrity: String
  ) -> DibaySystemStartConfig? {
    guard let root = try? JSONSerialization.jsonObject(with: configBytes) as? [String: Any] else {
      return nil
    }
    let generationId = (root["generationId"] as? String) ?? ""
    if generationId.isEmpty { return nil }
    if let expected = expectedGenerationId, !expected.isEmpty, expected != generationId {
      return nil
    }
    let bgHex = (root["backgroundColor"] as? String) ?? "#FFFCFC"
    let cream = UIColor(red: 1, green: 0.988, blue: 0.988, alpha: 1)
    let bg = Self.color(fromHex: bgHex, fallback: cream)
    var bgMedia = root["backgroundImageMediaId"] as? String
    if bgMedia?.isEmpty == true { bgMedia = nil }
    let brandEnabled = (root["brandAssetEnabled"] as? Bool) ?? false
    var brandMedia = root["brandAssetMediaId"] as? String
    if brandMedia?.isEmpty == true { brandMedia = nil }
    let sizeNorm = CGFloat((root["brandSizeNorm"] as? NSNumber)?.doubleValue ?? 0.28)
    let xNorm = CGFloat((root["brandXNorm"] as? NSNumber)?.doubleValue ?? 0.5)
    let yNorm = CGFloat((root["brandYNorm"] as? NSNumber)?.doubleValue ?? 0.5)
    var minMs = (root["minVisibleMs"] as? NSNumber)?.intValue ?? 500
    if minMs < 500 { minMs = 500 }
    if minMs > 5000 { minMs = 5000 }
    var assets: [String: Asset] = [:]
    if let assetsObj = root["assets"] as? [String: Any] {
      for (mediaId, raw) in assetsObj {
        guard let a = raw as? [String: Any] else { continue }
        assets[mediaId] = Asset(
          mediaId: mediaId,
          relativePath: (a["relativePath"] as? String) ?? "",
          integrity: (a["integrity"] as? String) ?? ""
        )
      }
    }
    return DibaySystemStartConfig(
      generationId: generationId,
      packageIntegrity: packageIntegrity,
      backgroundColor: bg,
      backgroundImageMediaId: bgMedia,
      brandAssetEnabled: brandEnabled,
      brandAssetMediaId: brandMedia,
      brandSizeNorm: sizeNorm,
      brandXNorm: xNorm,
      brandYNorm: yNorm,
      minVisibleMs: minMs,
      assetsByMediaId: assets
    )
  }

  func resolveBackgroundImage(verifiedRoot: URL) -> URL? {
    guard let mediaId = backgroundImageMediaId, !mediaId.isEmpty,
          let asset = assetsByMediaId[mediaId], !asset.relativePath.isEmpty
    else { return nil }
    let f = verifiedRoot.appendingPathComponent(asset.relativePath)
    return FileManager.default.fileExists(atPath: f.path) ? f : nil
  }

  func resolveBrandImage(verifiedRoot: URL) -> URL? {
    guard brandAssetEnabled,
          let mediaId = brandAssetMediaId, !mediaId.isEmpty,
          let asset = assetsByMediaId[mediaId], !asset.relativePath.isEmpty
    else { return nil }
    let f = verifiedRoot.appendingPathComponent(asset.relativePath)
    return FileManager.default.fileExists(atPath: f.path) ? f : nil
  }

  private static func color(fromHex raw: String, fallback: UIColor) -> UIColor {
    var h = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let n = UInt32(h, radix: 16) else { return fallback }
    return UIColor(
      red: CGFloat((n >> 16) & 0xFF) / 255.0,
      green: CGFloat((n >> 8) & 0xFF) / 255.0,
      blue: CGFloat(n & 0xFF) / 255.0,
      alpha: 1.0
    )
  }
}
