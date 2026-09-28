import CryptoKit
import Foundation

enum OpeningPackStore {
  private static let rootName = "opening-pack"
  private static let currentName = "current"
  private static let stagingName = "staging"
  private static let readyName = "READY"
  private static let manifestName = "manifest.json"

  static func currentDir() throws -> URL {
    let root = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ).appendingPathComponent(rootName, isDirectory: true)
    return root.appendingPathComponent(currentName, isDirectory: true)
  }

  static func isReady() -> Bool {
    do {
      let dir = try currentDir()
      let ready = dir.appendingPathComponent(readyName)
      let manifestURL = dir.appendingPathComponent(manifestName)
      guard FileManager.default.fileExists(atPath: ready.path),
            FileManager.default.fileExists(atPath: manifestURL.path),
            let data = try? Data(contentsOf: manifestURL),
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      else { return false }
      return try verify(dir: dir, manifest: json)
    } catch {
      return false
    }
  }

  static func readManifest() throws -> [String: Any] {
    let url = try currentDir().appendingPathComponent(manifestName)
    let data = try Data(contentsOf: url)
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw NSError(domain: "OpeningPack", code: 1)
    }
    return json
  }

  static func mediaFile(mediaId: String) throws -> URL {
    try currentDir()
      .appendingPathComponent("media", isDirectory: true)
      .appendingPathComponent("\(mediaId).webp")
  }

  static func install(manifest: [String: Any]) -> Bool {
    do {
      let root = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      ).appendingPathComponent(rootName, isDirectory: true)
      let staging = root.appendingPathComponent(stagingName, isDirectory: true)
      let current = root.appendingPathComponent(currentName, isDirectory: true)
      let fm = FileManager.default
      if fm.fileExists(atPath: staging.path) {
        try fm.removeItem(at: staging)
      }
      try fm.createDirectory(at: staging.appendingPathComponent("media", isDirectory: true), withIntermediateDirectories: true)
      let assets = dictArray(manifest["assets"])
      guard !assets.isEmpty else { return false }
      for asset in assets {
        guard let mediaId = string(asset["mediaId"]),
              let urlString = string(asset["url"]),
              let sha = string(asset["sha256"]),
              let bytes = intValue(asset["bytes"]),
              let url = URL(string: urlString)
        else { return false }
        guard let body = download(url: url), body.count == bytes else { return false }
        guard sha256Hex(body).caseInsensitiveCompare(sha) == .orderedSame else { return false }
        try body.write(to: staging.appendingPathComponent("media/\(mediaId).webp"))
      }
      let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [])
      try manifestData.write(to: staging.appendingPathComponent(manifestName))
      guard try verify(dir: staging, manifest: manifest) else { return false }
      try "1".data(using: .utf8)!.write(to: staging.appendingPathComponent(readyName))
      if fm.fileExists(atPath: current.path) {
        try fm.removeItem(at: current)
      }
      try fm.moveItem(at: staging, to: current)
      return true
    } catch {
      return false
    }
  }

  private static func verify(dir: URL, manifest: [String: Any]) throws -> Bool {
    guard let revisionId = string(manifest["revisionId"]),
          let checksum = string(manifest["checksum"])
    else { return false }
    let assets = dictArray(manifest["assets"])
    var hashes: [String] = []
    let mediaDir = dir.appendingPathComponent("media", isDirectory: true)
    for asset in assets {
      guard let mediaId = string(asset["mediaId"]),
            let sha = string(asset["sha256"]),
            let bytes = intValue(asset["bytes"])
      else { return false }
      let file = mediaDir.appendingPathComponent("\(mediaId).webp")
      let data = try Data(contentsOf: file)
      if data.count != bytes { return false }
      if sha256Hex(data).caseInsensitiveCompare(sha) != .orderedSame { return false }
      hashes.append(sha.lowercased())
    }
    hashes.sort()
    let joined = "\(revisionId):\(hashes.joined(separator: ","))"
    guard let joinedData = joined.data(using: .utf8) else { return false }
    return sha256Hex(joinedData).caseInsensitiveCompare(checksum) == .orderedSame
  }

  private static func download(url: URL) -> Data? {
    let sem = DispatchSemaphore(value: 0)
    var out: Data?
    URLSession.shared.dataTask(with: url) { data, _, _ in
      out = data
      sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 45)
    return out
  }

  static func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static func string(_ value: Any?) -> String? {
    value as? String
  }

  private static func intValue(_ value: Any?) -> Int? {
    if let i = value as? Int { return i }
    if let n = value as? NSNumber { return n.intValue }
    if let d = value as? Double { return Int(d) }
    return nil
  }

  private static func dictArray(_ value: Any?) -> [[String: Any]] {
    (value as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
  }
}
