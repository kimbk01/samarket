import Capacitor
import Foundation
import UIKit
import WebKit
import os.log

/// Native HOST only. No Scene/Layer/geometry/Timeline interpretation.
/// Serves sealed pack bytes over dibay-intro://pack — native reads bytes.
/// Checksum owner is the local installer VERIFYING phase, not crypto.subtle.
final class DibayIntroHostOwner: NSObject, WKScriptMessageHandler {
  static let shared = DibayIntroHostOwner()
  static let localOrigin = "dibay-intro://pack"
  private static let log = OSLog(subsystem: "com.dibay.app", category: "intro-host")
  private var overlay: UIView?
  private var packView: WKWebView?
  private var firstFailure: String?
  private var homeReady = false
  private var firstFrameReady = false
  private var schemeHandler: DibayIntroPackSchemeHandler?

  func attachIfReady(on host: UIView) {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let ready = docs.appendingPathComponent("dibay-intro/ready/READY")
    let index = docs.appendingPathComponent("dibay-intro/ready/index.html")
    let root = docs.appendingPathComponent("dibay-intro/ready")
    guard FileManager.default.fileExists(atPath: ready.path),
          FileManager.default.fileExists(atPath: index.path) else {
      os_log("%{public}@", log: Self.log, type: .info, "PACK_OPEN FAIL reason=ready_pack_missing")
      return
    }
    DispatchQueue.main.async { self.present(on: host, root: root) }
  }

  private func present(on host: UIView, root: URL) {
    if overlay != nil { return }
    let overlayView = UIView(frame: host.bounds)
    overlayView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlayView.backgroundColor = UIColor(red: 11 / 255, green: 66 / 255, blue: 26 / 255, alpha: 1)
    let handler = DibayIntroPackSchemeHandler(root: root)
    schemeHandler = handler
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(handler, forURLScheme: "dibay-intro")
    config.userContentController.add(self, name: "DibayIntroHost")
    let web = WKWebView(frame: overlayView.bounds, configuration: config)
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    web.isOpaque = true
    web.backgroundColor = overlayView.backgroundColor
    overlayView.addSubview(web)
    host.addSubview(overlayView)
    overlay = overlayView
    packView = web
    os_log("%{public}@", log: Self.log, type: .info, "PACK_OPEN BEGIN")
    web.load(URLRequest(url: URL(string: "dibay-intro://pack/index.html")!))
    os_log("%{public}@", log: Self.log, type: .info, "PACK_OPEN PASS")
  }

  func notifyHomePresentationReady(surface: String) {
    homeReady = true
    os_log("%{public}@", log: Self.log, type: .info, "HOME_PRESENTATION_READY surface=\(surface)")
    maybeDismiss()
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    let json = String(describing: message.body)
    os_log("%{public}@", log: Self.log, type: .info, json)
    if json.contains("FAIL"), firstFailure == nil {
      firstFailure = json
    }
    if json.contains("INTRO_FIRST_FRAME_READY"), json.contains("PASS") {
      firstFrameReady = true
      maybeDismiss()
    }
  }

  private func maybeDismiss() {
    guard homeReady, firstFrameReady else { return }
    DispatchQueue.main.async {
      self.overlay?.removeFromSuperview()
      self.packView = nil
      self.overlay = nil
      self.schemeHandler = nil
    }
  }
}

/// Native reads pack bytes only. Does not parse IntroDocument semantics.
final class DibayIntroPackSchemeHandler: NSObject, WKURLSchemeHandler {
  private let root: URL

  init(root: URL) {
    self.root = root
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    guard let url = urlSchemeTask.request.url else {
      urlSchemeTask.didFailWithError(NSError(domain: "DibayIntroHost", code: 400))
      return
    }
    var rel = url.path
    if rel.hasPrefix("/") { rel.removeFirst() }
    if rel.isEmpty { rel = "index.html" }
    let file = root.appendingPathComponent(rel).standardizedFileURL
    let rootPath = root.standardizedFileURL.path
    guard file.path == rootPath || file.path.hasPrefix(rootPath + "/") else {
      urlSchemeTask.didFailWithError(NSError(domain: "DibayIntroHost", code: 403))
      return
    }
    guard FileManager.default.fileExists(atPath: file.path),
          let data = try? Data(contentsOf: file) else {
      urlSchemeTask.didFailWithError(NSError(domain: "DibayIntroHost", code: 404))
      return
    }
    let mime = Self.mime(for: file.pathExtension)
    let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8")
    urlSchemeTask.didReceive(response)
    urlSchemeTask.didReceive(data)
    urlSchemeTask.didFinish()
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

  private static func mime(for ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html"
    case "js": return "text/javascript"
    case "json": return "application/json"
    case "woff2": return "font/woff2"
    case "gif": return "image/gif"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    default: return "application/octet-stream"
    }
  }
}
