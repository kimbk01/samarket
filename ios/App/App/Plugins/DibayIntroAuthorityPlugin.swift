import Capacitor
import Foundation

@objc(DibayIntroAuthorityPlugin)
public class DibayIntroAuthorityPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayIntroAuthorityPlugin"
  public let jsName = "DibayIntroAuthority"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getAuthorityStatus", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "beginCandidate", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "writeCandidatePack", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "writeCandidateAsset", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "markCandidateFailed", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "promoteCandidateToReady", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "assertFontAuthority", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "recordNoLiveMarker", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearNoLiveMarker", returnType: CAPPluginReturnPromise),
  ]

  @objc func getAuthorityStatus(_ call: CAPPluginCall) {
    do {
      let status = try DibayIntroAuthorityStore.shared.getAuthorityStatus()
      call.resolve(status)
    } catch {
      call.reject("getAuthorityStatus_failed", error.localizedDescription, error)
    }
  }

  @objc func beginCandidate(_ call: CAPPluginCall) {
    guard let metaJson = call.getString("metaJson"), !metaJson.isEmpty else {
      call.reject("missing_metaJson")
      return
    }
    do {
      try DibayIntroAuthorityStore.shared.beginCandidate(metaJson: metaJson)
      call.resolve(["ok": true])
    } catch {
      call.reject("beginCandidate_failed", error.localizedDescription, error)
    }
  }

  @objc func writeCandidatePack(_ call: CAPPluginCall) {
    guard let base64 = call.getString("base64") else {
      call.reject("missing_base64")
      return
    }
    do {
      try DibayIntroAuthorityStore.shared.writeCandidatePack(base64: base64)
      call.resolve(["ok": true])
    } catch {
      call.reject("writeCandidatePack_failed", error.localizedDescription, error)
    }
  }

  @objc func writeCandidateAsset(_ call: CAPPluginCall) {
    guard let path = call.getString("relativePackPath"),
          let base64 = call.getString("base64")
    else {
      call.reject("missing_args")
      return
    }
    do {
      try DibayIntroAuthorityStore.shared.writeCandidateAsset(
        relativePackPath: path,
        base64: base64
      )
      call.resolve(["ok": true])
    } catch {
      call.reject("writeCandidateAsset_failed", error.localizedDescription, error)
    }
  }

  @objc func markCandidateFailed(_ call: CAPPluginCall) {
    let metaJson = call.getString("metaJson") ?? "{}"
    let failureCode = call.getString("failureCode") ?? "FAILED"
    do {
      try DibayIntroAuthorityStore.shared.markCandidateFailed(
        metaJson: metaJson,
        failureCode: failureCode
      )
      call.resolve(["ok": true])
    } catch {
      call.reject("markCandidateFailed_failed", error.localizedDescription, error)
    }
  }

  @objc func promoteCandidateToReady(_ call: CAPPluginCall) {
    guard let metaJson = call.getString("metaJson") else {
      call.reject("missing_metaJson")
      return
    }
    do {
      try DibayIntroAuthorityStore.shared.promoteCandidateToReady(metaJson: metaJson)
      call.resolve(["ok": true])
    } catch {
      call.reject("promoteCandidateToReady_failed", error.localizedDescription, error)
    }
  }

  @objc func assertFontAuthority(_ call: CAPPluginCall) {
    do {
      let check = try DibayIntroAuthorityStore.shared.assertFonts()
      call.resolve(["ok": check.ok, "missing": check.missing])
    } catch {
      call.reject("assertFontAuthority_failed", error.localizedDescription, error)
    }
  }

  @objc func recordNoLiveMarker(_ call: CAPPluginCall) {
    let kind = call.getString("physicalLiveKind") ?? "NO_LIVE_INTRO"
    do {
      try DibayIntroAuthorityStore.shared.recordNoLiveMarker(physicalLiveKind: kind)
      call.resolve(["ok": true])
    } catch {
      call.reject("recordNoLiveMarker_failed", error.localizedDescription, error)
    }
  }

  @objc func clearNoLiveMarker(_ call: CAPPluginCall) {
    do {
      try DibayIntroAuthorityStore.shared.clearNoLiveMarker()
      call.resolve(["ok": true])
    } catch {
      call.reject("clearNoLiveMarker_failed", error.localizedDescription, error)
    }
  }
}
