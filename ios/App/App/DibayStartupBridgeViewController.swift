import UIKit
import Capacitor
import WebKit

/**
 * Product Startup (iOS):
 * LaunchScreen (cream + DIBAY logo) → Cap loads remote Next under same cream WebView →
 * dibayAppReady / dismissSplash removes Cap splash.
 * No Hybrid boot HTML · no location.replace · no Handoff Cover on normal cold start.
 */
class DibayStartupBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
  private var handoffCoverView: UIView?
  private var handoffCoverShown = false
  private var handoffCoverRemoved = false
  private var handoffPendingURL: String?
  private var bridgeScriptInstalled = false

  override func viewDidLoad() {
    super.viewDidLoad()
    applyStartupBackground()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    applyStartupBackground()
    installBootBridgeIfNeeded()
    // Product: never inject Hybrid dibay-startup.html — Cap remote document under Native splash.
    NSLog("DIBAY_WebView startup_boot_skip reason=native_splash_direct_remote")
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
        beginHandoffCover:function(url){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'beginHandoffCover',url:String(url||'')});}catch(e){}
        },
        endHandoffCover:function(){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'endHandoffCover'});}catch(e){}
        },
        setInitialSurface:function(surface){
          try{window.webkit.messageHandlers.DibayBootBridge.postMessage({action:'setInitialSurface',surface:String(surface||'community')});}catch(e){}
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
        NSLog("[DIBAY_Startup] dismissSplash bridge → Cap SplashScreen.hide")
        self.hideCapacitorSplash()
      case "beginHandoffCover":
        NSLog("[DIBAY_Startup] handoff_cover_begin_ignored reason=native_splash_direct_remote")
      case "endHandoffCover":
        self.hideNativeHandoffCover(source: "bridge")
      case "setInitialSurface":
        let surface = (body["surface"] as? String) ?? "community"
        UserDefaults.standard.set(surface, forKey: "dibay_initial_surface")
        NSLog("[DIBAY_Startup] initial_surface_persisted surface=%@", surface)
      default:
        break
      }
    }
  }

  private func hideCapacitorSplash() {
    // Cap plugin hide — LaunchScreen already replaced by Cap splash / WebView.
    NotificationCenter.default.post(name: Notification.Name("splashScreenHide"), object: nil)
    if let bridge = self.bridge {
      _ = bridge
    }
    // Prefer plugin API when available via JS already; native best-effort:
    DispatchQueue.main.async {
      self.applyStartupBackground()
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
