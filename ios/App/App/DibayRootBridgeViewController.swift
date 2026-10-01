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
   * Release authority (removed immediately, no fade):
   *  - NORMAL SUCCESS: web `dismissSplash` (DibayBootBridge) ONLY — sent after
   *    markInitialDestinationVisualReady + next frame. `isLoading` → false is NOT a success
   *    release: Next hydrates inside startTransition, so load can finish before Community commits.
   *  - FAILURE (non-regression only): when the first main load stops and the Next app bundle
   *    never started (`window.next` absent: navigation failure, blank/error document, bundle
   *    not executed), the continuation is removed so the screen is exactly what it was before R17.
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

  /**
   * INTRO every_launch identity — one UUID per native app process. Static: survives WKWebView
   * document reload and web-content-process recreation (Capacitor reloads the same WKWebView,
   * whose user scripts persist); a new app process gets a new value.
   * Identity only: no Intro renderer / cache / navigation / timer / business logic here.
   */
  static let launchEpoch = UUID().uuidString

  /**
   * capacitorDidLoad() runs inside loadView(), before viewDidLoad() → loadWebView() issues the
   * first navigation: App-target plugins are registered and the launch epoch user script is
   * installed before the very first document runs.
   */
  override func capacitorDidLoad() {
    super.capacitorDidLoad()
    registerAppTargetPlugins()
    installLaunchEpoch()
  }

  /**
   * App-target Capacitor plugins (Swift classes compiled into this App target, not npm packages).
   *
   * Single registration authority on iOS — same model as Android `MainActivity.registerPlugin`.
   * The Capacitor CLI rebuilds `capacitor.config.json` → `packageClassList` from node_modules on
   * every `cap copy` / `cap update` / `cap sync` and never lists App-target classes, so relying on
   * that list shipped builds without these plugins whenever a plain `cap sync` ran
   * (2026-10-01: Google/Kakao OAuth → `oauth_launcher_unavailable`). Registration here does not
   * depend on that generated file. `packageClassList` must NOT contain these classes
   * (`registerPluginInstance` would load a second instance).
   *
   * Runs inside loadView() (capacitorDidLoad) before viewDidLoad() → loadWebView(), so every
   * plugin is registered and exported before the first document runs.
   * Registration only: plugin behavior is unchanged.
   */
  static func makeAppTargetPlugins() -> [CAPPlugin] {
    [
      // Call (outgoing / VoIP / PiP)
      NativeCallServicePlugin(),
      DibayVoipCallPlugin(),
      DibayCallPipPlugin(),
      // Auth (Apple / Kakao native, Google + Kakao web OAuth launcher)
      NativeAppleAuthPlugin(),
      NativeKakaoAuthPlugin(),
      NativeOAuthLauncherPlugin(),
      // Delivery / media
      DibayAppIconDeliveryPlugin(),
      MessengerPhotoLibraryPlugin(),
      // Device identity
      DibayDeviceClassPlugin(),
    ]
  }

  private func registerAppTargetPlugins() {
    guard let bridge else {
      NSLog("[DibayRootBridge] app_target_plugins_not_registered reason=no_bridge")
      return
    }
    let plugins = Self.makeAppTargetPlugins()
    for plugin in plugins {
      bridge.registerPluginInstance(plugin)
    }
    NSLog("[DibayRootBridge] app_target_plugins_registered count=%d", plugins.count)
  }

  /** Installs `window.__DIBAY_LAUNCH_EPOCH__` at document start, before any application JS. */
  private func installLaunchEpoch() {
    guard let controller = webView?.configuration.userContentController else {
      NSLog("[DibayRootBridge] launch_epoch_not_installed reason=no_webview")
      return
    }
    let source =
      "Object.defineProperty(window,'__DIBAY_LAUNCH_EPOCH__',{value:'\(Self.launchEpoch)',writable:false,enumerable:false,configurable:false});"
    controller.addUserScript(
      WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    NSLog("[DibayRootBridge] launch_epoch_installed epoch=%@", Self.launchEpoch)
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
      return
    }
    guard launchContinuationSawLoading, let wv = webView else { return }
    // Load stopped. If the Next app bundle is running, hydration will send dismissSplash:
    // keep the continuation (success authority = dismissSplash). Otherwise the app never
    // started (failure) → release so R17 adds no new stuck path.
    wv.evaluateJavaScript("typeof window.next === 'object' && window.next !== null") { [weak self] result, _ in
      guard let self = self, self.launchContinuation != nil else { return }
      if (result as? Bool) == true {
        NSLog("[DibayRootBridge] launch_continuation_await_dismissSplash (app bundle running)")
      } else {
        self.removeLaunchContinuation(reason: "main_load_stopped_without_app")
      }
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
