import UIKit
import Capacitor
import WebKit

/**
 * Local First Startup (iOS parity).
 * Loads bundled `dibay-startup.html` with baseURL = remoteOrigin/__dibay-startup.
 * Native Handoff Cover bridges: beginHandoffCover / endHandoffCover / dismissSplash.
 */
class DibayStartupBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
  private var startupShellAttempted = false
  private var handoffCoverView: UIView?
  private var handoffCoverShown = false
  private var handoffCoverRemoved = false
  private var handoffPendingURL: String?
  private var handoffErrorLabel: UILabel?
  private var bridgeScriptInstalled = false

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    installBootBridgeIfNeeded()
    attemptLocalStartupShellLoad()
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
        // Capacitor SplashScreen.hide is driven from remote shellReady JS; local no-op ok.
        NSLog("[DIBAY_Startup] dismissSplash bridge")
      case "beginHandoffCover":
        let url = body["url"] as? String
        self.showNativeHandoffCover(pendingURL: url)
      case "endHandoffCover":
        self.hideNativeHandoffCover(source: "bridge")
      default:
        break
      }
    }
  }

  private func attemptLocalStartupShellLoad() {
    if startupShellAttempted { return }
    startupShellAttempted = true

    guard let webView = self.webView else {
      NSLog("[DIBAY_Startup] skip reason=missing_webview")
      return
    }

    guard let origin = resolveServerOrigin(), !origin.isEmpty,
          let baseURL = URL(string: origin + "/__dibay-startup") else {
      NSLog("[DIBAY_Startup] skip reason=missing_origin")
      return
    }

    guard let html = loadBundledStartupHtml() else {
      NSLog("[DIBAY_Startup] skip reason=missing_asset fallback=remote")
      return
    }

    NSLog("[DIBAY_Startup] loadHTMLString baseURL=%@", baseURL.absoluteString)
    webView.loadHTMLString(html, baseURL: baseURL)
  }

  private func resolveServerOrigin() -> String? {
    guard let url = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let server = json["server"] as? [String: Any],
          let serverUrl = server["url"] as? String else {
      return nil
    }
    var trimmed = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    while trimmed.hasSuffix("/") {
      trimmed.removeLast()
    }
    return trimmed
  }

  private func loadBundledStartupHtml() -> String? {
    let candidates: [URL?] = [
      Bundle.main.url(forResource: "dibay-startup", withExtension: "html"),
      Bundle.main.url(forResource: "dibay-startup", withExtension: "html", subdirectory: "public"),
      Bundle.main.resourceURL?.appendingPathComponent("public/dibay-startup.html"),
    ]
    for candidate in candidates {
      guard let url = candidate, FileManager.default.fileExists(atPath: url.path) else { continue }
      return try? String(contentsOf: url, encoding: .utf8)
    }
    return nil
  }

  private func showNativeHandoffCover(pendingURL: String?) {
    if handoffCoverRemoved {
      NSLog("[DIBAY_Startup] handoff_cover_begin_ignored already_removed")
      return
    }
    if handoffCoverShown {
      NSLog("[DIBAY_Startup] handoff_cover_begin_idempotent")
      return
    }
    handoffPendingURL = pendingURL
    let cover = buildHandoffCoverView()
    handoffCoverView = cover
    view.addSubview(cover)
    cover.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      cover.topAnchor.constraint(equalTo: view.topAnchor),
      cover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      cover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      cover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
    handoffCoverShown = true
    NSLog("[DIBAY_Startup] handoff_cover_show count=1")
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

  private func buildHandoffCoverView() -> UIView {
    let root = UIView()
    root.backgroundColor = UIColor(red: 1, green: 0.988, blue: 0.988, alpha: 1) // #FFFCFC

    let logo = UIImageView(image: UIImage(named: "Splash"))
    logo.contentMode = .scaleAspectFit
    logo.translatesAutoresizingMaskIntoConstraints = false

    let wordmark = UILabel()
    wordmark.text = "DIBAY"
    wordmark.font = UIFont.systemFont(ofSize: 15, weight: .bold)
    wordmark.textColor = UIColor(red: 0.043, green: 0.259, blue: 0.102, alpha: 1)
    wordmark.translatesAutoresizingMaskIntoConstraints = false

    let stack = UIStackView(arrangedSubviews: [logo, wordmark])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 16
    stack.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(stack)

    let nav = UIView()
    nav.backgroundColor = .white
    nav.translatesAutoresizingMaskIntoConstraints = false
    root.addSubview(nav)

    let err = UILabel()
    err.textColor = UIColor(white: 0.4, alpha: 1)
    err.font = UIFont.systemFont(ofSize: 14)
    err.numberOfLines = 0
    err.textAlignment = .center
    err.isHidden = true
    err.translatesAutoresizingMaskIntoConstraints = false
    handoffErrorLabel = err
    root.addSubview(err)

    NSLayoutConstraint.activate([
      logo.widthAnchor.constraint(equalToConstant: 72),
      logo.heightAnchor.constraint(equalToConstant: 72),
      stack.centerXAnchor.constraint(equalTo: root.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: root.centerYAnchor),
      nav.leadingAnchor.constraint(equalTo: root.leadingAnchor),
      nav.trailingAnchor.constraint(equalTo: root.trailingAnchor),
      nav.bottomAnchor.constraint(equalTo: root.safeAreaLayoutGuide.bottomAnchor),
      nav.heightAnchor.constraint(equalToConstant: 56),
      err.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
      err.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -24),
      err.bottomAnchor.constraint(equalTo: nav.topAnchor, constant: -16),
    ])
    return root
  }
}
