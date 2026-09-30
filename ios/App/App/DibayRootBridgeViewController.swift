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
 * - R17-OS app-native same-visual LaunchScreen continuation (see below)
 *
 * Intro / System Start / StartupCompositor product authority = ABSENT (R15 ZERO).
 */
class DibayRootBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
  private static let r15IntroZeroPurgedKey = "r15_intro_zero_purged_v1"
  private var bootBridgeInstalled = false

  /**
   * R17-OS — app-native SAME-VISUAL continuation of the TRUE iOS LaunchScreen.
   *
   * iOS removes the LaunchScreen when this VC's first frame appears, before the remote
   * WKWebView document has painted. The continuation is the SAME storyboard
   * (Info.plist UILaunchStoryboardName) instantiated on top of the WebView, so the pixels
   * users see do not change at the LaunchScreen → continuation boundary.
   *
   * Removed immediately (no fade) on the FIRST of:
   *  1. web `dismissSplash` (DibayBootBridge) — Community visual-ready, after the next frame;
   *  2. the first main-document load stopping (`isLoading` → false, success or failure) —
   *     non-regression guard: never holds longer than today's pre-R17 behaviour.
   * No timer, no network/data wait, no Admin fetch, no Intro, no navigation, no animation.
   */
  private var launchContinuation: UIViewController?
  private var launchContinuationLoadingObservation: NSKeyValueObservation?
  private var launchContinuationSawLoading = false

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
    // Continuation first, then the message handler: no dismiss can arrive before it exists.
    installLaunchContinuationIfNeeded()
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

  private func installLaunchContinuationIfNeeded() {
    guard launchContinuation == nil, let host = view else { return }
    let storyboardName =
      ((Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String) ?? "LaunchScreen")
      .replacingOccurrences(of: ".storyboard", with: "")
    guard let continuation = UIStoryboard(name: storyboardName, bundle: nil)
      .instantiateInitialViewController()
    else {
      NSLog("[DibayRootBridge] launch_continuation_skipped reason=storyboard_missing")
      return
    }
    continuation.view.frame = host.bounds
    continuation.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    host.addSubview(continuation.view)
    launchContinuation = continuation

    if let wv = webView {
      launchContinuationSawLoading = wv.isLoading
      launchContinuationLoadingObservation = wv.observe(\.isLoading, options: [.new]) { [weak self] _, change in
        let loading = change.newValue ?? false
        DispatchQueue.main.async { self?.onLaunchContinuationLoadingChanged(loading) }
      }
    }
    NSLog("[DibayRootBridge] launch_continuation_attached")
  }

  private func onLaunchContinuationLoadingChanged(_ loading: Bool) {
    guard launchContinuation != nil else { return }
    if loading {
      launchContinuationSawLoading = true
    } else if launchContinuationSawLoading {
      removeLaunchContinuation(reason: "main_load_stopped")
    }
  }

  private func removeLaunchContinuation(reason: String) {
    guard let continuation = launchContinuation else { return }
    launchContinuation = nil
    launchContinuationLoadingObservation?.invalidate()
    launchContinuationLoadingObservation = nil
    continuation.view.removeFromSuperview()
    NSLog("[DibayRootBridge] launch_continuation_removed reason=%@", reason)
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
    if action == "dismissSplash" {
      removeLaunchContinuation(reason: "web_dismissSplash")
      return
    }
    if action == "homePresentationReady" || action.lowercased().contains("homepresentationready") {
      NSLog("[DibayRootBridge] homePresentationReady (no Intro/System Start authority)")
    }
  }
}
