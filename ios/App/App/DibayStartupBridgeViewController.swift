import UIKit
import Capacitor
import WebKit
import os.log

/**
 * Product Startup (iOS) — 13TH:
 * LaunchScreen → optional VERIFIED Product Intro Scene1 → Home.
 * LIVE_MATCH_OR_NO_INTRO. No Candidate/Ready/Active.
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
    applyStartupBackground()
    DibayWebViewKeyboardChrome.install(on: webView)
    tryStartAuthoredIntro(source: "viewDidLoad")
    if introSessionActive {
      applyIntroHoldBackground()
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if introSessionActive {
      applyIntroHoldBackground()
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
    let cream = UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0) // #FFFCFC
    view.backgroundColor = cream
    view.window?.backgroundColor = cream
    webView?.isOpaque = false
    webView?.backgroundColor = cream
    webView?.scrollView.backgroundColor = cream
    webView?.scrollView.isOpaque = false
  }

  /// Opaque black under Intro so LaunchScreen→Scene1 never reveals cream product frame.
  private func applyIntroHoldBackground() {
    view.backgroundColor = .black
    view.window?.backgroundColor = .black
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

  private func hideCapacitorSplash() {
    NotificationCenter.default.post(name: Notification.Name("splashScreenHide"), object: nil)
    DispatchQueue.main.async {
      if self.introSessionActive {
        self.applyIntroHoldBackground()
      } else {
        self.applyStartupBackground()
      }
    }
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
