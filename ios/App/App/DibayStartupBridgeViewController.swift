import UIKit
import Capacitor
import WebKit
import os.log

/**
 * Product Startup (iOS) — ONE CORRECTION BATCH:
 * LaunchScreen → Cap SplashScreen continuation (LaunchScreen clone) → Intro first meaningful frame → dismiss.
 * Cap hide via SplashScreenPlugin.hide — NOT NotificationCenter (zero listeners / dead).
 * LIVE_MATCH_OR_NO_INTRO. No new overlay / fake splash / white-cover.
 * CallKit/PushKit/Agora/RTC untouched.
 */
class DibayStartupBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler, DibayIntroRuntimeListener {
  private static let startupLog = OSLog(subsystem: "com.dibay.app", category: "startup")

  private func startupInfo(_ message: String) {
    let line = "[DIBAY_Startup] " + message
    os_log("%{public}@", log: Self.startupLog, type: .info, line)
    NSLog("%@", line)
  }

  private var handoffCoverView: UIView?
  private var handoffCoverShown = false
  private var handoffCoverRemoved = false
  private var handoffPendingURL: String?
  private var bridgeScriptInstalled = false
  private var homePresentationReady = false
  private var introRuntime: DibayIntroRuntimeController?
  private var introSessionActive = false
  private var introFirstFrameReady = false
  private var introTimelineCompleted = false
  private var introLifecycle: IntroLifecycle = .pending
  /// F1 App/Cap continuation clock — not OS LaunchScreen duration.
  private var splashKeepStart = Date()
  private var capacitorSplashHidden = false
  private var capacitorSplashHideWorkItem: DispatchWorkItem?

  private enum IntroLifecycle: String {
    case pending
    case attached
    case dismissed
  }

  override var shouldAutorotate: Bool {
    DibayAppOrientationPolicy.shouldAutorotate(deviceClass: DibayDeviceClassClassifier.classify().deviceClass)
  }

  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    DibayAppOrientationPolicy.supportedInterfaceOrientations(
      deviceClass: DibayDeviceClassClassifier.classify().deviceClass
    )
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    splashKeepStart = Date()
    capacitorSplashHidden = false
    applySystemStartBackground()
    DibayWebViewKeyboardChrome.install(on: webView)
    tryStartAuthoredIntro(source: "viewDidLoad")
    if introSessionActive {
      applyIntroHoldBackground()
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if introSessionActive || introLifecycle == .pending {
      applySystemStartBackground()
    } else {
      applyStartupBackground()
    }
    DibayWebViewKeyboardChrome.install(on: webView)
    installBootBridgeIfNeeded()
    startupInfo(
      "startup_boot intro_session=\(introSessionActive ? 1 : 0) first_frame=\(introFirstFrameReady ? 1 : 0) lifecycle=\(introLifecycle.rawValue)"
    )
  }

  private func applyStartupBackground() {
    // After Intro→Home: product cream. During System Start / pre-Intro use Scene1 match.
    let cream = UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0) // #FFFCFC
    view.backgroundColor = cream
    view.window?.backgroundColor = cream
    webView?.isOpaque = false
    webView?.backgroundColor = cream
    webView?.scrollView.backgroundColor = cream
    webView?.scrollView.isOpaque = false
  }

  /// System Start / Scene1 hold — build-bound BG from system_start_timing.json (F1/F4).
  private func applyIntroHoldBackground() {
    let scene1Match = Self.resolveSystemStartBackgroundColor()
    view.backgroundColor = scene1Match
    view.window?.backgroundColor = scene1Match
    webView?.isOpaque = true
    webView?.backgroundColor = scene1Match
    webView?.scrollView.backgroundColor = scene1Match
  }

  /// Pre-decision System Start surface (same as LaunchScreen / Scene1 BG).
  private func applySystemStartBackground() {
    applyIntroHoldBackground()
  }

  private func tryStartAuthoredIntro(source: String) {
    if introLifecycle != .pending { return }
    DispatchQueue.global(qos: .userInitiated).async {
      let runtime = DibayIntroRuntimeController()
      runtime.listener = self
      let sync = runtime.prepareVerifiedPackage()
      DispatchQueue.main.async {
        let started = runtime.attachAndPlayIfPrepared(hostView: self.view, sync: sync)
        if started {
          self.introRuntime = runtime
          self.introSessionActive = true
          self.introLifecycle = .attached
          self.applyIntroHoldBackground()
          self.startupInfo("intro_session_active=1 source=\(source)")
        } else {
          self.introRuntime = nil
          self.introSessionActive = false
          self.introLifecycle = .dismissed
          self.startupInfo(
            "intro_attach_skipped source=\(source) reason=\(sync.reason)"
          )
          // F1: NO_INTRO / attach fail — Cap continuation still honors minVisibleMs.
          self.hideCapacitorSplash()
        }
      }
    }
  }

  func onFirstFrameReady(identity: [String: Any]) {
    introFirstFrameReady = true
    let packId = (identity["packageId"] as? String) ?? ""
    startupInfo("intro_first_frame_ready packageId=\(packId)")
    hideCapacitorSplash()
  }

  func onIntroCompleted(reason: String) {
    introTimelineCompleted = true
    startupInfo("intro_completed reason=\(reason)")
    if reason.hasPrefix("CTA_DESTINATION:") {
      let dest = String(reason.dropFirst("CTA_DESTINATION:".count)).trimmingCharacters(in: .whitespacesAndNewlines)
      if !dest.isEmpty {
        UserDefaults.standard.set(dest.lowercased(), forKey: "dibay_initial_surface")
        startupInfo("intro_cta_destination surface=\(dest)")
      }
    }
    tryIntroHomeHandoff(source: "intro_completed")
  }

  func onIntroAborted(reason: String) {
    introSessionActive = false
    introFirstFrameReady = false
    introTimelineCompleted = false
    introLifecycle = .dismissed
    startupInfo("intro_aborted reason=\(reason)")
    applyStartupBackground()
  }

  private func tryIntroHomeHandoff(source: String) {
    if !introTimelineCompleted {
      startupInfo("intro_handoff_wait timeline source=\(source)")
      return
    }
    if !homePresentationReady {
      startupInfo("intro_handoff_hold_last_frame source=\(source)")
      return
    }
    introRuntime?.dismissAfterHandoff()
    introRuntime = nil
    introSessionActive = false
    introLifecycle = .dismissed
    applyStartupBackground()
    startupInfo("intro_handoff_done source=\(source)")
    ensureInitialRemotePathOnce()
  }

  private var initialRemotePathApplied = false

  /// Apply CTA / Admin initialSurface after Intro→Home handoff (V7).
  private func ensureInitialRemotePathOnce() {
    if initialRemotePathApplied { return }
    guard let webView = self.webView else { return }
    let surface = (
      (UserDefaults.standard.string(forKey: "dibay_initial_surface") ?? "community")
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
    )
    if surface.isEmpty || surface == "community" {
      initialRemotePathApplied = true
      startupInfo("initial_remote_path skip surface=community")
      return
    }
    let path: String
    switch surface {
    case "trade": path = "/market"
    case "food": path = "/stores"
    case "chat": path = "/community-messenger?section=chats"
    case "my": path = "/mypage"
    default:
      initialRemotePathApplied = true
      return
    }
    guard let origin = Self.resolveCapServerOrigin(), !origin.isEmpty else {
      return
    }
    initialRemotePathApplied = true
    let url = origin + path
    startupInfo("initial_remote_path url=\(url)")
    if let u = URL(string: url) {
      webView.load(URLRequest(url: u))
    }
  }

  private static func resolveCapServerOrigin() -> String? {
    guard let path = Bundle.main.path(forResource: "capacitor.config", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let server = root["server"] as? [String: Any],
          var url = server["url"] as? String
    else { return nil }
    while url.hasSuffix("/") { url.removeLast() }
    return url.isEmpty ? nil : url
  }

  private func notifyHomePresentationReady(source: String) {
    homePresentationReady = true
    startupInfo("HOME_PRESENTATION_READY source=\(source)")
    tryIntroHomeHandoff(source: "home_ready")
  }

  private func installBootBridgeIfNeeded() {
    if bridgeScriptInstalled { return }
    guard let webView = self.webView else { return }
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "DibayBootBridge")
    webView.configuration.userContentController.add(self, name: "DibayBootBridge")
    let polyfill = """
    (function(){
      if(window.DibayBootBridge) return;
      window.DibayBootBridge={
        dismissSplash:function(){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'dismissSplash'});}catch(e){}
        },
        homePresentationReady:function(){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'homePresentationReady'});}catch(e){}
        },
        beginHandoffCover:function(url){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'beginHandoffCover',url:String(url||'')});}catch(e){}
        },
        endHandoffCover:function(){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'endHandoffCover'});}catch(e){}
        },
        setInitialSurface:function(surface){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'setInitialSurface',surface:String(surface||'community')});}catch(e){}
        },
        persistStartupConfig:function(json){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'persistStartupConfig',json:String(json||'')});}catch(e){}
        },
        getPendingRoute:function(){ return ''; }
      };
    })();
    """
    let script = WKUserScript(source: polyfill, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    webView.configuration.userContentController.addUserScript(script)
    bridgeScriptInstalled = true
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "DibayBootBridge" else { return }
    let body = message.body as? [String: Any] ?? [:]
    let action = (body["action"] as? String) ?? ""
    DispatchQueue.main.async {
      switch action {
      case "dismissSplash":
        self.startupInfo("boot_dismiss_requested source=bridge")
        // When Intro owns presentation, splash already released on first frame.
        if !self.introSessionActive {
          self.hideCapacitorSplash()
        }
      case "homePresentationReady":
        self.notifyHomePresentationReady(source: "bridge")
      case "beginHandoffCover":
        NSLog("[DIBAY_Startup] handoff_cover_begin_ignored reason=native_splash_direct_remote")
      case "endHandoffCover":
        self.hideNativeHandoffCover(source: "bridge")
      case "setInitialSurface":
        let surface = (body["surface"] as? String) ?? "community"
        UserDefaults.standard.set(surface, forKey: "dibay_initial_surface")
      case "persistStartupConfig":
        let json = (body["json"] as? String) ?? ""
        DibayStartupConfigCache.persistInitialSurfaceOnly(json: json)
      default:
        break
      }
    }
  }

  /// F1: Admin minVisibleMs applies to Cap continuation hide — not OS LaunchScreen duration.
  private func hideCapacitorSplash() {
    if capacitorSplashHidden { return }
    let minMs = Self.resolveSystemStartMinVisibleMs()
    let elapsedMs = Date().timeIntervalSince(splashKeepStart) * 1000.0
    let remaining = max(0, Double(minMs) - elapsedMs)
    capacitorSplashHideWorkItem?.cancel()
    if remaining > 0 {
      startupInfo("cap_splash_hold_remaining_ms=\(Int(remaining)) min=\(minMs)")
      let work = DispatchWorkItem { [weak self] in
        self?.hideCapacitorSplashNow(source: "min_visible_elapsed")
      }
      capacitorSplashHideWorkItem = work
      DispatchQueue.main.asyncAfter(deadline: .now() + remaining / 1000.0, execute: work)
      return
    }
    hideCapacitorSplashNow(source: "ready")
  }

  private func hideCapacitorSplashNow(source: String) {
    if capacitorSplashHidden { return }
    capacitorSplashHidden = true
    capacitorSplashHideWorkItem = nil
    startupInfo("cap_splash_hide source=\(source)")
    invokeCapacitorSplashPluginHide()
    DispatchQueue.main.async {
      if self.introSessionActive {
        self.applyIntroHoldBackground()
      } else {
        self.applyStartupBackground()
      }
    }
  }

  /// Real Cap SplashScreen.hide — NotificationCenter "splashScreenHide" has zero listeners.
  private func invokeCapacitorSplashPluginHide() {
    guard let plugin = bridge?.plugin(withName: "SplashScreen") else {
      startupInfo("cap_splash_hide_plugin_missing")
      return
    }
    let call = CAPPluginCall(
      callbackId: "dibay-system-start-hide",
      methodName: "hide",
      options: ["fadeOutDuration": 0],
      success: { _, _ in },
      error: { _, _ in }
    )
    let sel = NSSelectorFromString("hide:")
    guard plugin.responds(to: sel) else {
      startupInfo("cap_splash_hide_selector_missing")
      return
    }
    _ = plugin.perform(sel, with: call)
  }

  private static func resolveSystemStartMinVisibleMs() -> Int {
    guard let url = Bundle.main.url(forResource: "system_start_timing", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return 500
    }
    let n = (obj["SYSTEM_START_MIN_VISIBLE_MS"] as? Int)
      ?? Int(obj["SYSTEM_START_MIN_VISIBLE_MS"] as? Double ?? 500)
    // Build materializer only emits contract presets; fail-closed floor/ceiling for safety.
    if n < 500 { return 500 }
    if n > 5000 { return 5000 }
    return n
  }

  private static func resolveSystemStartBackgroundColor() -> UIColor {
    guard let url = Bundle.main.url(forResource: "system_start_timing", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let hex = obj["backgroundColor"] as? String
    else {
      return UIColor(red: 0x31 / 255.0, green: 0x2E / 255.0, blue: 0x81 / 255.0, alpha: 1.0)
    }
    return colorFromHex(hex)
  }

  private static func colorFromHex(_ raw: String) -> UIColor {
    var h = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let n = UInt32(h, radix: 16) else {
      return UIColor(red: 0x31 / 255.0, green: 0x2E / 255.0, blue: 0x81 / 255.0, alpha: 1.0)
    }
    return UIColor(
      red: CGFloat((n >> 16) & 0xFF) / 255.0,
      green: CGFloat((n >> 8) & 0xFF) / 255.0,
      blue: CGFloat(n & 0xFF) / 255.0,
      alpha: 1.0
    )
  }

  private func hideNativeHandoffCover(source: String) {
    if handoffCoverRemoved {
      NSLog("[DIBAY_Startup] handoff_cover_hide_idempotent source=%@", source)
      return
    }
    if !handoffCoverShown {
      handoffCoverRemoved = true
      return
    }
    handoffCoverView?.removeFromSuperview()
    handoffCoverView = nil
    handoffCoverShown = false
    handoffCoverRemoved = true
    handoffPendingURL = nil
    NSLog("[DIBAY_Startup] handoff_cover_hide count=1 source=%@", source)
  }
}

enum DibayStartupConfigCache {
  /// Persist Admin initialSurface only — no Product Intro assets.
  static func persistInitialSurfaceOnly(json: String) {
    DispatchQueue.global(qos: .utility).async {
      guard let data = json.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
      let surface = (obj["initialSurface"] as? String) ?? "community"
      UserDefaults.standard.set(surface, forKey: "dibay_initial_surface")
      NSLog("[DIBAY_Startup] persist_ok surface=%@", surface)
    }
  }
}
