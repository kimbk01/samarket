import Foundation

/// 13th local authority — ONE verified package only.
final class DibayIntroVerifiedStore {
  private let base: URL

  init() {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    base = docs.appendingPathComponent("dibay-intro-13", isDirectory: true)
  }

  var verifiedDir: URL { base.appendingPathComponent("verified", isDirectory: true) }
  var verifiedPackURL: URL { verifiedDir.appendingPathComponent("pack.json") }
  var verifiedMetaURL: URL { verifiedDir.appendingPathComponent("meta.json") }
  var livePointerURL: URL { base.appendingPathComponent("live-pointer.json") }
  var stagingDir: URL { base.appendingPathComponent("staging", isDirectory: true) }

  func readVerifiedMetaOrNull() -> [String: Any]? {
    guard let data = try? Data(contentsOf: verifiedMetaURL),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return obj
  }

  func hasVerifiedMatching(packageId: String, packageIntegrity: String) -> Bool {
    guard let meta = readVerifiedMetaOrNull(),
          (meta["packageId"] as? String) == packageId,
          (meta["packageIntegrity"] as? String) == packageIntegrity,
          FileManager.default.fileExists(atPath: verifiedPackURL.path)
    else { return false }
    do {
      _ = try DibayIntroPackModel.parseAndVerify(
        packURL: verifiedPackURL, expectedIntegrity: packageIntegrity)
      return true
    } catch {
      return false
    }
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
    packBytes: Data,
    releaseId: String,
    packageId: String,
    packageIntegrity: String
  ) throws {
    let fm = FileManager.default
    try? fm.removeItem(at: stagingDir)
    try fm.createDirectory(at: stagingDir, withIntermediateDirectories: true)
    let stagingPack = stagingDir.appendingPathComponent("pack.json")
    try packBytes.write(to: stagingPack, options: .atomic)
    let parsed = try DibayIntroPackModel.parseAndVerify(
      packURL: stagingPack, expectedIntegrity: packageIntegrity)
    if parsed.packageId != packageId {
      try? fm.removeItem(at: stagingDir)
      throw NSError(domain: "DibayIntro", code: 1, userInfo: [NSLocalizedDescriptionKey: "package_id_mismatch"])
    }
    let meta: [String: Any] = [
      "releaseId": releaseId,
      "packageId": packageId,
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
  }

  func quarantineVerified(reason: String) {
    let q = base.appendingPathComponent("quarantine-\(Int(Date().timeIntervalSince1970 * 1000))", isDirectory: true)
    if FileManager.default.fileExists(atPath: verifiedDir.path) {
      try? FileManager.default.moveItem(at: verifiedDir, to: q)
      NSLog("[DibayIntroStore] quarantine reason=%@", reason)
    }
  }
}
