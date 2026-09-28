import Capacitor
import Foundation
import UIKit
import WebKit

/**
 * Intro 9th rebuild — HOST ONLY.
 * Does not parse Scene/Layer geometry, fit, timeline, or renderer.
 */
enum IntroShowHost {
  private static let logTag = "DIBAY_IntroShowHost"
  private static var holdingSplash = false
  private static var presenting = false
  private static var overlay: WKWebView?
  private static let handler = IntroShowHostMessageHandler()

  static func isHoldingSplash() -> Bool { holdingSplash }
  static func isPresenting() -> Bool { presenting }

  @discardableResult
  static func tryPresent(on host: UIViewController) -> Bool {
    let readyDir = packRoot().appendingPathComponent("ready")
    let marker = readyDir.appendingPathComponent("READY")
    let index = readyDir.appendingPathComponent("index.html")
    guard FileManager.default.fileExists(atPath: marker.path),
          FileManager.default.fileExists(atPath: index.path)
    else {
      holdingSplash = false
      return false
    }
    holdingSplash = true
    let config = WKWebViewConfiguration()
    config.defaultWebpagePreferences.allowsContentJavaScript = true
    config.websiteDataStore = .nonPersistent()
    config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
    config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
    config.userContentController.add(handler, name: "introShowHost")
    let webView = WKWebView(frame: host.view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.backgroundColor = UIColor(red: 11 / 255, green: 66 / 255, blue: 26 / 255, alpha: 1)
    webView.isOpaque = true
    webView.scrollView.isScrollEnabled = false
    webView.scrollView.backgroundColor = webView.backgroundColor
    webView.navigationDelegate = handler
    host.view.addSubview(webView)
    overlay = webView
    presenting = true
    webView.loadFileURL(index, allowingReadAccessTo: readyDir)
    NSLog("[%@] intro_overlay_loaded local_ready=1 network=0", logTag)
    return true
  }

  static func abortIfPresenting(reason: String) {
    guard presenting else { return }
    DispatchQueue.main.async {
      evaluate("abort")
      NSLog("[%@] intro_abort reason=%@ call_mutation=0", logTag, reason)
    }
  }

  static func notifyHomePresentationReady() {
    DispatchQueue.main.async {
      evaluate("notifyHomePresentationReady")
    }
  }

  static func stagePack(packJson: String) throws -> Bool {
    guard let data = packJson.data(using: .utf8),
          let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let identity = root["identity"] as? [String: Any],
          identity["completeness"] as? String == "complete",
          let engineJs = root["engineJs"] as? String,
          let indexHtml = root["indexHtml"] as? String,
          let manifest = root["manifest"],
          let media = root["media"] as? [String: String]
    else {
      throw NSError(domain: "IntroShowHost", code: 1, userInfo: [NSLocalizedDescriptionKey: "pack_incomplete"])
    }
    let fm = FileManager.default
    let rootDir = packRoot()
    let staging = rootDir.appendingPathComponent("staging")
    let ready = rootDir.appendingPathComponent("ready")
    let previous = rootDir.appendingPathComponent("previous")
    if fm.fileExists(atPath: staging.path) { try fm.removeItem(at: staging) }
    try fm.createDirectory(at: staging.appendingPathComponent("media"), withIntermediateDirectories: true)
    try engineJs.write(to: staging.appendingPathComponent("engine.js"), atomically: true, encoding: .utf8)
    try indexHtml.write(to: staging.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    let manifestData = try JSONSerialization.data(withJSONObject: manifest)
    try manifestData.write(to: staging.appendingPathComponent("manifest.json"))
    let identityData = try JSONSerialization.data(withJSONObject: identity)
    try identityData.write(to: staging.appendingPathComponent("identity.json"))
    for (name, b64) in media {
      guard let bytes = Data(base64Encoded: b64) else {
        throw NSError(domain: "IntroShowHost", code: 2, userInfo: [NSLocalizedDescriptionKey: "media_b64"])
      }
      try bytes.write(to: staging.appendingPathComponent("media").appendingPathComponent(name))
    }
    let checksum = (identity["packChecksum"] as? String) ?? "complete"
    try checksum.write(to: staging.appendingPathComponent("READY"), atomically: true, encoding: .utf8)
    if fm.fileExists(atPath: previous.path) { try fm.removeItem(at: previous) }
    if fm.fileExists(atPath: ready.path) { try fm.moveItem(at: ready, to: previous) }
    try fm.moveItem(at: staging, to: ready)
    return fm.fileExists(atPath: ready.appendingPathComponent("READY").path)
  }

  fileprivate static func handleEngineEvent(_ type: String) {
    DispatchQueue.main.async {
      if type == "INTRO_FIRST_FRAME_READY" {
        holdingSplash = false
        NotificationCenter.default.post(name: Notification.Name("splashScreenHide"), object: nil)
        NSLog("[%@] intro_first_frame splash_dismiss", logTag)
        return
      }
      if type == "HANDOFF" || type == "HANDOFF_FAIL_OPEN" || type == "ABORT" {
        removeOverlay()
      }
    }
  }

  private static func evaluate(_ method: String) {
    overlay?.evaluateJavaScript(
      "globalThis.__INTRO_ENGINE_HOST__ && globalThis.__INTRO_ENGINE_HOST__.\(method)()"
    )
  }

  private static func removeOverlay() {
    overlay?.removeFromSuperview()
    overlay = nil
    presenting = false
    holdingSplash = false
    NSLog("[%@] intro_overlay_removed", logTag)
  }

  private static func packRoot() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("intro-show", isDirectory: true)
  }
}

private final class IntroShowHostMessageHandler: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "introShowHost" else { return }
    var type = ""
    if let dict = message.body as? [String: Any] {
      type = (dict["type"] as? String) ?? ""
    } else if let text = message.body as? String,
              let data = text.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      type = (dict["type"] as? String) ?? ""
    }
    IntroShowHost.handleEngineEvent(type)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    if navigationAction.request.url?.isFileURL == true {
      decisionHandler(.allow)
    } else {
      decisionHandler(.cancel)
    }
  }
}

@objc(IntroShowHostPlugin)
public class IntroShowHostPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "IntroShowHostPlugin"
  public let jsName = "IntroShowHost"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "notifyHomePresentationReady", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "stagePack", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "abort", returnType: CAPPluginReturnPromise),
  ]

  @objc func notifyHomePresentationReady(_ call: CAPPluginCall) {
    IntroShowHost.notifyHomePresentationReady()
    call.resolve(["ok": true])
  }

  @objc func abort(_ call: CAPPluginCall) {
    IntroShowHost.abortIfPresenting(reason: call.getString("reason") ?? "js")
    call.resolve(["ok": true])
  }

  @objc func stagePack(_ call: CAPPluginCall) {
    guard let packJson = call.getString("packJson"), !packJson.isEmpty else {
      call.reject("pack_missing")
      return
    }
    do {
      let ready = try IntroShowHost.stagePack(packJson: packJson)
      call.resolve(["ready": ready])
    } catch {
      call.reject("pack_stage_failed")
    }
  }
}
