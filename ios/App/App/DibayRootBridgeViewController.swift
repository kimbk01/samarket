import Capacitor
import UIKit
import WebKit

/**
 * Cap root host — OS_REQUIRED_BOOT_PRIMITIVE only.
 *
 * Owns:
 * - FD3 app-shell orientation (DeviceClass)
 * - WebView keyboard chrome install
 * - DibayBootBridge homePresentationReady → splash dismiss path
 *
 * Intro / System Start / StartupCompositor product authority = ABSENT (R15 ZERO).
 */
class DibayRootBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
  private static let r15IntroZeroPurgedKey = "r15_intro_zero_purged_v1"
  private var bootBridgeInstalled = false

  override var shouldAutorotate: Bool {
    DibayAppOrientationPolicy.shouldAutorotate(
      deviceClass: DibayDeviceClassClassifier.classify().deviceClass
    )
  }

  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    DibayAppOrientationPolicy.supportedInterfaceOrientations(
      deviceClass: DibayDeviceClassClassifier.classify().deviceClass
    )
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    purgeObsoleteIntroSystemStartLocalStateOnce()
    DibayWebViewKeyboardChrome.install(on: webView)
    installBootBridgeIfNeeded()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    DibayWebViewKeyboardChrome.install(on: webView)
  }

  /// R15 ZERO — delete legacy Intro / System Start / opening-pack dirs once (no product renderer).
  private func purgeObsoleteIntroSystemStartLocalStateOnce() {
    let defaults = UserDefaults.standard
    if defaults.bool(forKey: Self.r15IntroZeroPurgedKey) {
      return
    }
    let fm = FileManager.default
    var purgedPaths: [String] = []

    if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first {
      for name in [
        "dibay-intro-13",
        "dibay-intro",
        "dibay-startup-envelope",
        "dibay-system-start",
      ] {
        let url = docs.appendingPathComponent(name, isDirectory: true)
        if purgeObsoleteDirectoryIfPresent(at: url, fm: fm) {
          purgedPaths.append(url.path)
        }
      }
    }

    if let appSupport = try? fm.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: false
    ) {
      let openingPack = appSupport.appendingPathComponent("opening-pack", isDirectory: true)
      if purgeObsoleteDirectoryIfPresent(at: openingPack, fm: fm) {
        purgedPaths.append(openingPack.path)
      }
    }

    defaults.set(true, forKey: Self.r15IntroZeroPurgedKey)
    if purgedPaths.isEmpty {
      NSLog("[DibayRootBridge] r15_intro_zero_purged_v1 (no obsolete dirs on disk)")
    } else {
      NSLog("[DibayRootBridge] r15_intro_zero_purged paths=%@", purgedPaths.joined(separator: ","))
    }
  }

  private func purgeObsoleteDirectoryIfPresent(at url: URL, fm: FileManager) -> Bool {
    var isDir: ObjCBool = false
    guard fm.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue else {
      return false
    }
    do {
      try fm.removeItem(at: url)
      return true
    } catch {
      NSLog("[DibayRootBridge] r15_purge_failed path=%@ err=%@", url.path, String(describing: error))
      return false
    }
  }

  private func installBootBridgeIfNeeded() {
    guard !bootBridgeInstalled, let wv = webView else { return }
    wv.configuration.userContentController.add(self, name: "DibayBootBridge")
    bootBridgeInstalled = true
  }

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard message.name == "DibayBootBridge" else { return }
    let body = message.body
    var action = ""
    if let dict = body as? [String: Any] {
      action = (dict["action"] as? String) ?? ""
    } else if let s = body as? String {
      action = s
    }
    if action == "homePresentationReady" || action.lowercased().contains("homepresentationready") {
      NSLog("[DibayRootBridge] homePresentationReady (no Intro/System Start authority)")
    }
  }
}
