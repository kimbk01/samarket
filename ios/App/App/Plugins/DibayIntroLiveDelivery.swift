import Foundation

/// LIVE_MATCH_OR_NO_INTRO delivery for iOS.
final class DibayIntroLiveDelivery {
  struct Result {
    let canRender: Bool
    let reason: String
    let packageId: String?
    let releaseId: String?
    let packageIntegrity: String?

    static func noIntro(_ reason: String) -> Result {
      Result(canRender: false, reason: reason, packageId: nil, releaseId: nil, packageIntegrity: nil)
    }
  }

  let store = DibayIntroVerifiedStore()

  func syncForColdStart() -> Result {
    guard let origin = Self.resolveServerOrigin(), !origin.isEmpty else {
      return offlinePolicy()
    }
    do {
      guard let live = try httpGetJson(url: origin + "/api/intro/device/live", timeout: 8) else {
        return offlinePolicy()
      }
      guard (live["ok"] as? Bool) == true else { return offlinePolicy() }
      let kind = (live["kind"] as? String) ?? ""
      if kind == "NO_LIVE" {
        try store.writeLivePointer(live)
        return .noIntro("NO_LIVE")
      }
      guard kind == "LIVE" else { return .noIntro("LIVE_KIND_UNKNOWN:\(kind)") }
      let releaseId = (live["releaseId"] as? String) ?? ""
      let packageId = (live["packageId"] as? String) ?? ""
      let packageIntegrity = (live["packageIntegrity"] as? String) ?? ""
      let packUrl = (live["packRetrievalUrl"] as? String) ?? ""
      try store.writeLivePointer(live)
      if packageId.isEmpty || packageIntegrity.isEmpty || packUrl.isEmpty {
        return .noIntro("LIVE_INCOMPLETE")
      }
      if store.hasVerifiedMatching(packageId: packageId, packageIntegrity: packageIntegrity) {
        return Result(
          canRender: true, reason: "VERIFIED_MATCH",
          packageId: packageId, releaseId: releaseId, packageIntegrity: packageIntegrity)
      }
      guard let packBytes = try httpGetData(url: packUrl, timeout: 15), !packBytes.isEmpty else {
        return .noIntro("PACK_DOWNLOAD_FAILED")
      }
      do {
        try store.atomicCommitVerified(
          packBytes: packBytes,
          releaseId: releaseId,
          packageId: packageId,
          packageIntegrity: packageIntegrity
        )
      } catch {
        store.quarantineVerified(reason: "commit_failed")
        return .noIntro("COMMIT_FAILED:\(error.localizedDescription)")
      }
      return Result(
        canRender: true, reason: "DOWNLOADED_COMMITTED",
        packageId: packageId, releaseId: releaseId, packageIntegrity: packageIntegrity)
    } catch {
      return offlinePolicy()
    }
  }

  private func offlinePolicy() -> Result {
    let pointer = store.readLivePointerOrNull()
    let meta = store.readVerifiedMetaOrNull()
    guard let pointer else { return .noIntro("FIRST_INSTALL_OR_NO_POINTER") }
    if (pointer["kind"] as? String) == "NO_LIVE" { return .noIntro("NO_LIVE_CACHED") }
    let packageId = (pointer["packageId"] as? String) ?? ""
    let integrity = (pointer["packageIntegrity"] as? String) ?? ""
    let releaseId = (pointer["releaseId"] as? String) ?? ""
    if let meta,
       (meta["packageId"] as? String) == packageId,
       (meta["packageIntegrity"] as? String) == integrity,
       store.hasVerifiedMatching(packageId: packageId, packageIntegrity: integrity)
    {
      return Result(
        canRender: true, reason: "OFFLINE_VERIFIED_MATCH",
        packageId: packageId, releaseId: releaseId, packageIntegrity: integrity)
    }
    return .noIntro("OFFLINE_LIVE_MISMATCH_OR_MISSING")
  }

  private static func resolveServerOrigin() -> String? {
    guard let path = Bundle.main.path(forResource: "capacitor.config", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let server = root["server"] as? [String: Any],
          var url = server["url"] as? String
    else { return nil }
    while url.hasSuffix("/") { url.removeLast() }
    return url.isEmpty ? nil : url
  }

  private func httpGetJson(url: String, timeout: TimeInterval) throws -> [String: Any]? {
    guard let data = try httpGetData(url: url, timeout: timeout) else { return nil }
    return try JSONSerialization.jsonObject(with: data) as? [String: Any]
  }

  private func httpGetData(url: String, timeout: TimeInterval) throws -> Data? {
    guard let u = URL(string: url) else { return nil }
    var req = URLRequest(url: u, timeoutInterval: timeout)
    req.httpMethod = "GET"
    let sem = DispatchSemaphore(value: 0)
    var out: Data?
    var err: Error?
    URLSession.shared.dataTask(with: req) { data, response, error in
      err = error
      if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
        out = data
      }
      sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + timeout + 1)
    if let err { throw err }
    return out
  }
}
