import Foundation
import CryptoKit

/**
 * DIBAY INTRO — iOS local Intro authority store (V2).
 * Base: Application Support/intro/authority/v1/
 * No tmp as durable Ready authority. Active pointer inert.
 */
final class DibayIntroAuthorityStore {
  static let shared = DibayIntroAuthorityStore()

  private let rootRelative = "intro/authority/v1"
  private let fontFiles = [
    "Pretendard-Regular.otf",
    "Pretendard-Medium.otf",
    "Pretendard-SemiBold.otf",
    "Pretendard-Bold.otf",
  ]
  private let fontSha256 = [
    "3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93",
    "d39e50e4bb52b4993b6a4eeb821a171254745bd824446af01e1f616b89fface0",
    "c89bc43027dc7cde5726e96223376f8eec09302b2fc1f8147fd5b57cfc376118",
    "2e91915fab54df71cc9598ebf608b2bdb54c6fe3c066ac61dff0bc44fca71cc7",
  ]

  private init() {}

  func baseDir() throws -> URL {
    let appSupport = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let base = appSupport.appendingPathComponent(rootRelative, isDirectory: true)
    try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    return base
  }

  private func candidateDir() throws -> URL {
    try baseDir().appendingPathComponent("candidate", isDirectory: true)
  }

  private func readyDir() throws -> URL {
    try baseDir().appendingPathComponent("ready", isDirectory: true)
  }

  private func activeDir() throws -> URL {
    try baseDir().appendingPathComponent("active", isDirectory: true)
  }

  private func fontsDir() throws -> URL {
    try baseDir().appendingPathComponent("fonts", isDirectory: true)
  }

  func getAuthorityStatus() throws -> [String: Any] {
    try ensureFontsInstalled()
    var out: [String: Any] = [:]
    out["baseDir"] = try baseDir().path
    out["ready"] = try readReadyIdentity()
    out["candidate"] = try readCandidateIdentity()
    out["active"] = try readActiveIdentity()
    let marker = try baseDir().appendingPathComponent("no-live.json")
    if FileManager.default.fileExists(atPath: marker.path),
       let data = try? Data(contentsOf: marker),
       let s = String(data: data, encoding: .utf8) {
      out["noLiveMarker"] = s
    } else {
      out["noLiveMarker"] = NSNull()
    }
    let fonts = try assertFonts()
    out["fontAuthorityOk"] = fonts.ok
    out["fontMissing"] = fonts.missing
    return out
  }

  private func readReadyIdentity() throws -> [String: Any] {
    let metaURL = try readyDir().appendingPathComponent("meta.json")
    guard FileManager.default.fileExists(atPath: metaURL.path),
          let data = try? Data(contentsOf: metaURL),
          let meta = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return ["status": "NONE"]
    }
    var ids: [String] = []
    var digests: [String] = []
    if let assets = meta["sealedAssets"] as? [[String: Any]] {
      for a in assets {
        ids.append(a["sealedAssetId"] as? String ?? "")
        digests.append(a["sealedIntegrity"] as? String ?? "")
      }
    }
    return [
      "status": "READY",
      "publishedRevisionId": meta["publishedRevisionId"] as? String ?? "",
      "packId": meta["packId"] as? String ?? "",
      "packIntegrity": meta["packIntegrity"] as? String ?? "",
      "sealedAssetIds": ids,
      "sealedIntegrities": digests,
      "activePointer": NSNull(),
    ]
  }

  private func readActiveIdentity() throws -> [String: Any] {
    let metaURL = try activeDir().appendingPathComponent("meta.json")
    guard FileManager.default.fileExists(atPath: metaURL.path),
          let data = try? Data(contentsOf: metaURL),
          let meta = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return ["status": "NONE"]
    }
    return [
      "status": "ACTIVE",
      "publishedRevisionId": meta["publishedRevisionId"] as? String ?? "",
      "packId": meta["packId"] as? String ?? "",
      "packIntegrity": meta["packIntegrity"] as? String ?? "",
      "localPackPath": meta["localPackPath"] as? String ?? "ready/pack.json",
      "localAssetsRoot": meta["localAssetsRoot"] as? String ?? "ready/assets",
      "compatibilityVersion": meta["compatibilityVersion"] as? String ?? "",
      "activatedAt": meta["activatedAt"] as? String ?? "",
    ]
  }

  /// V3 Active pointer only — no iOS Intro renderer in V3 scope.
  func promoteReadyToActive(metaJson: String) throws {
    let readyMetaURL = try readyDir().appendingPathComponent("meta.json")
    let readyPackURL = try readyDir().appendingPathComponent("pack.json")
    guard FileManager.default.fileExists(atPath: readyMetaURL.path),
          FileManager.default.fileExists(atPath: readyPackURL.path),
          let readyData = try? Data(contentsOf: readyMetaURL),
          var ready = try JSONSerialization.jsonObject(with: readyData) as? [String: Any],
          let incomingData = metaJson.data(using: .utf8),
          var incoming = try JSONSerialization.jsonObject(with: incomingData) as? [String: Any]
    else {
      throw NSError(domain: "DibayIntro", code: 1, userInfo: [NSLocalizedDescriptionKey: "NO_READY"])
    }
    let pub = incoming["publishedRevisionId"] as? String ?? ""
    let packId = incoming["packId"] as? String ?? ""
    let packIntegrity = incoming["packIntegrity"] as? String ?? ""
    guard pub == (ready["publishedRevisionId"] as? String ?? ""),
          packId == (ready["packId"] as? String ?? ""),
          packIntegrity == (ready["packIntegrity"] as? String ?? "")
    else {
      throw NSError(domain: "DibayIntro", code: 2, userInfo: [NSLocalizedDescriptionKey: "READY_ACTIVE_IDENTITY_MISMATCH"])
    }
    // packIntegrity is canonical digest, not raw file SHA-256.
    guard let packData = try? Data(contentsOf: readyPackURL),
          let packJson = try JSONSerialization.jsonObject(with: packData) as? [String: Any],
          pub == (packJson["publishedRevisionId"] as? String ?? ""),
          packId == (packJson["packId"] as? String ?? ""),
          packIntegrity == (packJson["packIntegrity"] as? String ?? "")
    else {
      throw NSError(domain: "DibayIntro", code: 3, userInfo: [NSLocalizedDescriptionKey: "READY_PACK_EMBEDDED_IDENTITY_MISMATCH"])
    }
    incoming["status"] = "ACTIVE"
    if (incoming["localPackPath"] as? String ?? "").isEmpty {
      incoming["localPackPath"] = "ready/pack.json"
    }
    if (incoming["localAssetsRoot"] as? String ?? "").isEmpty {
      incoming["localAssetsRoot"] = "ready/assets"
    }
    let active = try activeDir()
    try FileManager.default.createDirectory(at: active, withIntermediateDirectories: true)
    let outData = try JSONSerialization.data(withJSONObject: incoming)
    try writeAtomic(active.appendingPathComponent("meta.json"), outData)
  }

  private func readCandidateIdentity() throws -> [String: Any] {
    let metaURL = try candidateDir().appendingPathComponent("meta.json")
    guard FileManager.default.fileExists(atPath: metaURL.path),
          let data = try? Data(contentsOf: metaURL),
          let meta = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return ["status": "NONE"]
    }
    var out: [String: Any] = [
      "status": meta["status"] as? String ?? "CANDIDATE",
      "publishedRevisionId": meta["publishedRevisionId"] as? String ?? "",
      "packId": meta["packId"] as? String ?? "",
      "packIntegrity": meta["packIntegrity"] as? String ?? "",
    ]
    if let code = meta["failureCode"] as? String {
      out["failureCode"] = code
    }
    return out
  }

  func beginCandidate(metaJson: String) throws {
    let fm = FileManager.default
    let dir = try candidateDir()
    if fm.fileExists(atPath: dir.path) {
      try fm.removeItem(at: dir)
    }
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    try fm.createDirectory(
      at: dir.appendingPathComponent("assets", isDirectory: true),
      withIntermediateDirectories: true
    )
    try writeAtomic(dir.appendingPathComponent("meta.json"), Data(metaJson.utf8))
  }

  func writeCandidatePack(base64: String) throws {
    guard let data = Data(base64Encoded: base64) else {
      throw NSError(domain: "DibayIntro", code: 1, userInfo: [NSLocalizedDescriptionKey: "bad_base64"])
    }
    try writeAtomic(try candidateDir().appendingPathComponent("pack.json"), data)
  }

  func writeCandidateAsset(relativePackPath: String, base64: String) throws {
    guard !relativePackPath.contains(".."),
          relativePackPath.hasPrefix("assets/")
    else {
      throw NSError(domain: "DibayIntro", code: 2, userInfo: [NSLocalizedDescriptionKey: "invalid_path"])
    }
    guard let data = Data(base64Encoded: base64) else {
      throw NSError(domain: "DibayIntro", code: 1, userInfo: [NSLocalizedDescriptionKey: "bad_base64"])
    }
    let dest = try candidateDir().appendingPathComponent(relativePackPath)
    try FileManager.default.createDirectory(
      at: dest.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try writeAtomic(dest, data)
  }

  func markCandidateFailed(metaJson: String, failureCode: String) throws {
    guard var meta = try JSONSerialization.jsonObject(with: Data(metaJson.utf8)) as? [String: Any]
    else {
      throw NSError(domain: "DibayIntro", code: 3, userInfo: [NSLocalizedDescriptionKey: "bad_meta"])
    }
    meta["status"] = "FAILED"
    meta["failureCode"] = failureCode
    let data = try JSONSerialization.data(withJSONObject: meta)
    try writeAtomic(try candidateDir().appendingPathComponent("meta.json"), data)
  }

  func promoteCandidateToReady(metaJson: String) throws {
    let fm = FileManager.default
    let cand = try candidateDir()
    let ready = try readyDir()
    let tmp = try baseDir().appendingPathComponent("ready.tmp.\(Int(Date().timeIntervalSince1970 * 1000))", isDirectory: true)
    if fm.fileExists(atPath: tmp.path) {
      try fm.removeItem(at: tmp)
    }
    try fm.createDirectory(at: tmp, withIntermediateDirectories: true)
    try fm.copyItem(
      at: cand.appendingPathComponent("pack.json"),
      to: tmp.appendingPathComponent("pack.json")
    )
    let tmpAssets = tmp.appendingPathComponent("assets", isDirectory: true)
    try fm.createDirectory(at: tmpAssets, withIntermediateDirectories: true)
    let candAssets = cand.appendingPathComponent("assets", isDirectory: true)
    if fm.fileExists(atPath: candAssets.path),
       let files = try? fm.contentsOfDirectory(atPath: candAssets.path) {
      for name in files {
        try fm.copyItem(
          at: candAssets.appendingPathComponent(name),
          to: tmpAssets.appendingPathComponent(name)
        )
      }
    }
    guard var meta = try JSONSerialization.jsonObject(with: Data(metaJson.utf8)) as? [String: Any]
    else {
      throw NSError(domain: "DibayIntro", code: 3, userInfo: [NSLocalizedDescriptionKey: "bad_meta"])
    }
    meta["status"] = "READY"
    meta["activePointer"] = NSNull()
    let metaData = try JSONSerialization.data(withJSONObject: meta)
    try writeAtomic(tmp.appendingPathComponent("meta.json"), metaData)

    let backup = try baseDir().appendingPathComponent("ready.bak.\(Int(Date().timeIntervalSince1970 * 1000))", isDirectory: true)
    if fm.fileExists(atPath: ready.path) {
      try fm.moveItem(at: ready, to: backup)
    }
    do {
      try fm.moveItem(at: tmp, to: ready)
    } catch {
      if fm.fileExists(atPath: backup.path) {
        try? fm.moveItem(at: backup, to: ready)
      }
      throw error
    }
    if fm.fileExists(atPath: backup.path) {
      try? fm.removeItem(at: backup)
    }
    if fm.fileExists(atPath: cand.path) {
      try? fm.removeItem(at: cand)
    }
  }

  struct FontCheck {
    var ok: Bool
    var missing: [String]
  }

  func assertFonts() throws -> FontCheck {
    try ensureFontsInstalled()
    var missing: [String] = []
    let dir = try fontsDir()
    for (i, name) in fontFiles.enumerated() {
      let url = dir.appendingPathComponent(name)
      guard let data = try? Data(contentsOf: url) else {
        missing.append(name)
        continue
      }
      let hex = sha256Hex(data)
      if hex.lowercased() != fontSha256[i].lowercased() {
        missing.append("\(name):HASH_MISMATCH")
      }
    }
    return FontCheck(ok: missing.isEmpty, missing: missing)
  }

  func recordNoLiveMarker(physicalLiveKind: String) throws {
    let obj: [String: Any] = [
      "physicalLiveKind": physicalLiveKind,
      "recordedAt": Int(Date().timeIntervalSince1970 * 1000),
    ]
    let data = try JSONSerialization.data(withJSONObject: obj)
    try writeAtomic(try baseDir().appendingPathComponent("no-live.json"), data)
  }

  func clearNoLiveMarker() throws {
    let marker = try baseDir().appendingPathComponent("no-live.json")
    if FileManager.default.fileExists(atPath: marker.path) {
      try FileManager.default.removeItem(at: marker)
    }
  }

  private func ensureFontsInstalled() throws {
    let fm = FileManager.default
    let dir = try fontsDir()
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    for name in fontFiles {
      let dest = dir.appendingPathComponent(name)
      if fm.fileExists(atPath: dest.path) { continue }
      if let bundled = Bundle.main.url(forResource: name.replacingOccurrences(of: ".otf", with: ""), withExtension: "otf", subdirectory: "intro/fonts")
          ?? Bundle.main.url(forResource: name.replacingOccurrences(of: ".otf", with: ""), withExtension: "otf") {
        try fm.copyItem(at: bundled, to: dest)
      }
    }
  }

  private func writeAtomic(_ url: URL, _ data: Data) throws {
    let tmp = url.appendingPathExtension("tmp")
    try data.write(to: tmp, options: .atomic)
    let fm = FileManager.default
    if fm.fileExists(atPath: url.path) {
      try fm.removeItem(at: url)
    }
    try fm.moveItem(at: tmp, to: url)
  }

  private func sha256Hex(_ data: Data) -> String {
    let digest = SHA256.hash(data: data)
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}
