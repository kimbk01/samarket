import Foundation

/// Layer B Live delivery — fetch → download → integrity → atomic commit.
/// Cold may render previous verified local when download incomplete (bounded).
final class DibaySystemStartLiveDelivery {
  struct Result {
    let canRender: Bool
    let reason: String
    let generationId: String?
    let packageIntegrity: String?

    static func noRender(_ reason: String) -> Result {
      Result(canRender: false, reason: reason, generationId: nil, packageIntegrity: nil)
    }
  }

  let store = DibaySystemStartVerifiedStore()

  func syncLive() -> Result {
    guard let origin = Self.resolveServerOrigin(), !origin.isEmpty else {
      return previousVerifiedOrNone("NO_ORIGIN")
    }
    do {
      guard let live = try httpGetJson(url: origin + "/api/intro/device/system-start/live", timeout: 1.5) else {
        return previousVerifiedOrNone("LIVE_FETCH_FAILED")
      }
      guard (live["ok"] as? Bool) == true else { return previousVerifiedOrNone("LIVE_NOT_OK") }
      let kind = (live["kind"] as? String) ?? ""
      if kind == "NO_LIVE" {
        try store.writeLivePointer(live)
        store.quarantineVerified(reason: "NO_LIVE")
        return .noRender("NO_LIVE")
      }
      guard kind == "LIVE" else { return previousVerifiedOrNone("LIVE_KIND_UNKNOWN:\(kind)") }
      let generationId = (live["generationId"] as? String) ?? ""
      let packageIntegrity = (live["packageIntegrity"] as? String) ?? ""
      let configUrl = (live["configRetrievalUrl"] as? String) ?? ""
      let assetUrls = live["assetRetrievalUrls"] as? [String: String] ?? [:]
      try store.writeLivePointer(live)
      if generationId.isEmpty || packageIntegrity.isEmpty || configUrl.isEmpty {
        return previousVerifiedOrNone("LIVE_INCOMPLETE")
      }
      if store.hasVerifiedMatching(generationId: generationId, packageIntegrity: packageIntegrity) {
        return Result(
          canRender: true, reason: "VERIFIED_MATCH",
          generationId: generationId, packageIntegrity: packageIntegrity)
      }
      let downloadDeadline = Date().addingTimeInterval(4.0)
      guard let configBytes = try httpGetData(
        url: configUrl, timeout: Self.remainingTimeout(until: downloadDeadline)), !configBytes.isEmpty
      else {
        return previousVerifiedOrNone("CONFIG_DOWNLOAD_FAILED")
      }
      let hex = DibayIntroPackModel.sha256Hex(of: configBytes)
      guard hex.caseInsensitiveCompare(packageIntegrity) == .orderedSame else {
        return previousVerifiedOrNone("CONFIG_INTEGRITY_MISMATCH")
      }
      guard let parsed = DibaySystemStartConfig.parse(
        configBytes: configBytes, expectedGenerationId: generationId, packageIntegrity: packageIntegrity)
      else {
        return previousVerifiedOrNone("CONFIG_PARSE_FAILED")
      }
      var byRel: [String: Data] = [:]
      for (mediaId, url) in assetUrls {
        guard let asset = parsed.assetsByMediaId[mediaId], !asset.relativePath.isEmpty else {
          return previousVerifiedOrNone("ASSET_MAP_FAILED:\(mediaId)")
        }
        if url.isEmpty {
          return previousVerifiedOrNone("ASSET_URL_MISSING:\(mediaId)")
        }
        let assetTimeout = Self.remainingTimeout(until: downloadDeadline)
        if assetTimeout <= 0 {
          return previousVerifiedOrNone("DOWNLOAD_BUDGET_EXCEEDED")
        }
        guard let bytes = try httpGetData(url: url, timeout: assetTimeout), !bytes.isEmpty else {
          return previousVerifiedOrNone("ASSET_DOWNLOAD_FAILED:\(mediaId)")
        }
        byRel[asset.relativePath] = bytes
      }
      for asset in parsed.assetsByMediaId.values {
        if byRel[asset.relativePath] == nil {
          return previousVerifiedOrNone("ASSET_MISSING_IN_LIVE:\(asset.mediaId)")
        }
      }
      do {
        try store.atomicCommitVerified(
          configBytes: configBytes,
          assetBytesByRelativePath: byRel,
          generationId: generationId,
          packageIntegrity: packageIntegrity
        )
      } catch {
        store.quarantineVerified(reason: "commit_failed")
        return previousVerifiedOrNone("COMMIT_FAILED:\(error.localizedDescription)")
      }
      return Result(
        canRender: true, reason: "DOWNLOADED_COMMITTED",
        generationId: generationId, packageIntegrity: packageIntegrity)
    } catch {
      return previousVerifiedOrNone("SYNC_EXCEPTION")
    }
  }

  private func previousVerifiedOrNone(_ reason: String) -> Result {
    if let prev = store.readVerifiedConfigOrNull() {
      NSLog("[DibaySystemStartDelivery] previous_verified reason=%@ generationId=%@", reason, prev.generationId)
      return Result(
        canRender: true, reason: "PREVIOUS_VERIFIED:\(reason)",
        generationId: prev.generationId, packageIntegrity: prev.packageIntegrity)
    }
    return .noRender(reason)
  }

  private static func remainingTimeout(until deadline: Date) -> TimeInterval {
    let left = deadline.timeIntervalSinceNow
    if left <= 0 { return 0 }
    return min(4.0, left)
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
    guard timeout > 0, let u = URL(string: url) else { return nil }
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
    _ = sem.wait(timeout: .now() + timeout + 0.25)
    if let err { throw err }
    return out
  }
}
