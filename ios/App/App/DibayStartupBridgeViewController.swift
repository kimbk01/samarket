import UIKit
import Capacitor
import WebKit
import os.log

/**
 * Product Startup (iOS):
 * LaunchScreen (cream + DIBAY logo) → Native Startup Intro (cached Admin config) →
 * shellReady / dismissSplash → exit animation → remove Intro → Cap WebView.
 * No Hybrid boot HTML · no location.replace · no second Web Intro.
 */
class DibayStartupBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
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
  private var introOverlay: UIView?
  private var introContent: UIView?
  private var introDismissing = false
  /// One cold-startup Intro per VC lifetime. After dismiss, never reattach on viewDidAppear
  /// (call UI present/dismiss must not bring Intro back or block WebView touches).
  private enum IntroLifecycle: String {
    case pending
    case attached
    case dismissing
    case dismissed
  }
  private var introLifecycle: IntroLifecycle = .pending
  private var activeConfig: [String: Any] = [:]

  override func viewDidLoad() {
    super.viewDidLoad()
    applyStartupBackground()
    DibayWebViewKeyboardChrome.install(on: webView)
    attachNativeIntroIfNeeded(source: "viewDidLoad")
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    applyStartupBackground()
    DibayWebViewKeyboardChrome.install(on: webView)
    installBootBridgeIfNeeded()
    // First appear may run before viewDidLoad attach completes; after dismiss, must not reattach.
    attachNativeIntroIfNeeded(source: "viewDidAppear")
    startupInfo("startup_boot_skip reason=native_splash_direct_remote intro_lifecycle=\(introLifecycle.rawValue)")
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
        self.startupInfo("intro_dismiss_requested source=bridge lifecycle=\(self.introLifecycle.rawValue)")
        self.dismissNativeIntroThenHideSplash()
      case "beginHandoffCover":
        NSLog("[DIBAY_Startup] handoff_cover_begin_ignored reason=native_splash_direct_remote")
      case "endHandoffCover":
        self.hideNativeHandoffCover(source: "bridge")
      case "setInitialSurface":
        let surface = (body["surface"] as? String) ?? "community"
        UserDefaults.standard.set(surface, forKey: "dibay_initial_surface")
        NSLog("[DIBAY_Startup] initial_surface_persisted surface=%@", surface)
      case "persistStartupConfig":
        let json = (body["json"] as? String) ?? ""
        DibayStartupConfigCache.persist(json: json)
      default:
        break
      }
    }
  }

  private func attachNativeIntroIfNeeded(source: String) {
    switch introLifecycle {
    case .attached:
      startupInfo("intro_attach_skipped source=\(source) reason=already_attached")
      return
    case .dismissing:
      startupInfo("intro_reattach_blocked source=\(source) reason=dismissing")
      return
    case .dismissed:
      startupInfo("intro_reattach_blocked source=\(source) reason=terminal_dismissed")
      return
    case .pending:
      break
    }
    if introOverlay != nil {
      introLifecycle = .attached
      startupInfo("intro_attach_skipped source=\(source) reason=overlay_present")
      return
    }
    activeConfig = DibayStartupConfigCache.loadActive()
    let overlay = UIView(frame: view.bounds)
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.isUserInteractionEnabled = true
    applyBackground(to: overlay, config: activeConfig)

    let content = buildContent(config: activeConfig)
    content.translatesAutoresizingMaskIntoConstraints = false
    overlay.addSubview(content)
    NSLayoutConstraint.activate([
      content.leadingAnchor.constraint(equalTo: overlay.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: overlay.trailingAnchor),
      content.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor),
      content.bottomAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.bottomAnchor),
    ])
    view.addSubview(overlay)
    introOverlay = overlay
    introContent = content
    introLifecycle = .attached
    playEnter(on: content, config: activeConfig)
    startupInfo("intro_attach source=\(source) version=\(String(describing: activeConfig["version"] ?? 0))")
  }

  private func finalizeIntroRemoved(overlay: UIView, source: String) {
    overlay.isUserInteractionEnabled = false
    overlay.layer.removeAllAnimations()
    overlay.removeFromSuperview()
    introOverlay = nil
    introContent = nil
    introDismissing = false
    introLifecycle = .dismissed
    startupInfo("intro_removed source=\(source) interaction=0 superview=nil lifecycle=dismissed")
  }

  private func dismissNativeIntroThenHideSplash() {
    if introLifecycle == .dismissed {
      hideCapacitorSplash()
      return
    }
    if introDismissing || introLifecycle == .dismissing {
      hideCapacitorSplash()
      return
    }
    introDismissing = true
    introLifecycle = .dismissing
    let exit = (activeConfig["exitAnimation"] as? String) ?? "fade_out"
    let durMs = DibayStartupConfigCache.clampDuration(activeConfig["exitDurationMs"] as? Int ?? 220)
    let seconds = TimeInterval(durMs) / 1000.0
    let target = introContent ?? introOverlay
    guard let target = target, let overlay = introOverlay else {
      // No overlay (warm / race) — still terminal so viewDidAppear cannot create one.
      introDismissing = false
      introLifecycle = .dismissed
      startupInfo("intro_removed source=dismiss_no_overlay lifecycle=dismissed")
      hideCapacitorSplash()
      return
    }
    if exit == "none" || durMs <= 0 {
      finalizeIntroRemoved(overlay: overlay, source: "dismiss_immediate")
      hideCapacitorSplash()
      return
    }
    UIView.animate(withDuration: seconds, animations: {
      self.applyExitTransform(exit, on: target)
      target.alpha = 0
    }, completion: { _ in
      self.finalizeIntroRemoved(overlay: overlay, source: "dismiss_animated")
      self.hideCapacitorSplash()
    })
  }

  private func applyExitTransform(_ exit: String, on view: UIView) {
    switch exit {
    case "scale_out", "fade_scale_out":
      view.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
    case "slide_up":
      view.transform = CGAffineTransform(translationX: 0, y: -40)
    default:
      break
    }
  }

  private func playEnter(on view: UIView, config: [String: Any]) {
    let enter = (config["enterAnimation"] as? String) ?? "fade_in"
    let durMs = DibayStartupConfigCache.clampDuration(config["enterDurationMs"] as? Int ?? 280)
    let seconds = TimeInterval(durMs) / 1000.0
    if enter == "none" || durMs <= 0 { return }
    view.alpha = 0
    switch enter {
    case "scale_in":
      view.transform = CGAffineTransform(scaleX: 0.86, y: 0.86)
    case "fade_scale_in":
      view.transform = CGAffineTransform(scaleX: 0.9, y: 0.9)
    case "slide_up":
      view.transform = CGAffineTransform(translationX: 0, y: 36)
    case "slide_down":
      view.transform = CGAffineTransform(translationX: 0, y: -36)
    default:
      break
    }
    UIView.animate(withDuration: seconds) {
      view.alpha = 1
      view.transform = .identity
    }
  }

  private func applyBackground(to view: UIView, config: [String: Any]) {
    let solid = DibayStartupConfigCache.color(from: config["backgroundColor"] as? String, fallback: UIColor(red: 1, green: 0.988, blue: 0.988, alpha: 1))
    let type = (config["backgroundType"] as? String) ?? "solid"
    if type == "gradient" {
      let layer = CAGradientLayer()
      layer.frame = UIScreen.main.bounds
      let from = DibayStartupConfigCache.color(from: config["gradientFrom"] as? String, fallback: solid)
      let to = DibayStartupConfigCache.color(from: config["gradientTo"] as? String, fallback: solid)
      layer.colors = [from.cgColor, to.cgColor]
      let dir = (config["gradientDirection"] as? String) ?? "vertical"
      if dir == "horizontal" {
        layer.startPoint = CGPoint(x: 0, y: 0.5)
        layer.endPoint = CGPoint(x: 1, y: 0.5)
      } else if dir == "diagonal" {
        layer.startPoint = CGPoint(x: 0, y: 0)
        layer.endPoint = CGPoint(x: 1, y: 1)
      } else {
        layer.startPoint = CGPoint(x: 0.5, y: 0)
        layer.endPoint = CGPoint(x: 0.5, y: 1)
      }
      view.layer.insertSublayer(layer, at: 0)
      return
    }
    if type == "image", let img = DibayStartupConfigCache.loadBackgroundImage() {
      let iv = UIImageView(image: img)
      iv.frame = UIScreen.main.bounds
      iv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      let fit = (config["backgroundImageFit"] as? String) ?? "cover"
      iv.contentMode = fit == "contain" ? .scaleAspectFit : .scaleAspectFill
      view.addSubview(iv)
      view.sendSubviewToBack(iv)
      view.backgroundColor = solid
      return
    }
    view.backgroundColor = solid
  }

  private func buildContent(config: [String: Any]) -> UIView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 12
    let vertical = (config["logoVertical"] as? String) ?? "center"
    // Spacer top/bottom for vertical position
    let top = UIView()
    let bottom = UIView()
    top.translatesAutoresizingMaskIntoConstraints = false
    bottom.translatesAutoresizingMaskIntoConstraints = false

    let logo = UIImageView(image: DibayStartupConfigCache.loadLogoImage() ?? UIImage(named: "DibayStartupLogo"))
    logo.contentMode = .scaleAspectFit
    let size = DibayStartupConfigCache.logoWidth(config: config)
    logo.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      logo.widthAnchor.constraint(equalToConstant: size),
      logo.heightAnchor.constraint(equalToConstant: size),
    ])

    stack.addArrangedSubview(logo)

    if (config["showWordmark"] as? Bool) ?? true {
      let wm = UILabel()
      wm.text = (config["wordmark"] as? String) ?? "DIBAY"
      wm.font = .boldSystemFont(ofSize: 15)
      wm.textColor = DibayStartupConfigCache.color(from: config["captionColor"] as? String, fallback: UIColor(red: 0.043, green: 0.259, blue: 0.102, alpha: 1))
      stack.addArrangedSubview(wm)
    }

    if (config["captionEnabled"] as? Bool) ?? false {
      var caption = (config["captionKo"] as? String) ?? ""
      if caption.isEmpty { caption = (config["captionEn"] as? String) ?? "" }
      if !caption.isEmpty {
        let cap = UILabel()
        cap.text = caption
        cap.font = .systemFont(ofSize: 13)
        cap.textAlignment = .center
        cap.numberOfLines = 2
        cap.textColor = DibayStartupConfigCache.color(from: config["captionColor"] as? String, fallback: UIColor(red: 0.043, green: 0.259, blue: 0.102, alpha: 1))
        stack.addArrangedSubview(cap)
      }
    }

    if ((config["showSpinner"] as? Bool) ?? true) || ((config["ambientAnimation"] as? String) == "spinner") {
      let spinner = UIActivityIndicatorView(style: .medium)
      spinner.startAnimating()
      stack.addArrangedSubview(spinner)
    }

    let wrap = UIView()
    wrap.addSubview(top)
    wrap.addSubview(stack)
    wrap.addSubview(bottom)
    stack.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      top.topAnchor.constraint(equalTo: wrap.topAnchor),
      top.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
      top.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
      bottom.bottomAnchor.constraint(equalTo: wrap.bottomAnchor),
      bottom.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
      bottom.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
      stack.centerXAnchor.constraint(equalTo: wrap.centerXAnchor),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: wrap.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: wrap.trailingAnchor, constant: -24),
    ])
    if vertical == "upper" {
      NSLayoutConstraint.activate([
        stack.topAnchor.constraint(equalTo: top.bottomAnchor, constant: 48),
        bottom.heightAnchor.constraint(equalTo: top.heightAnchor, multiplier: 2.2),
        top.heightAnchor.constraint(greaterThanOrEqualToConstant: 24),
      ])
    } else if vertical == "lower" {
      NSLayoutConstraint.activate([
        stack.bottomAnchor.constraint(equalTo: bottom.topAnchor, constant: -48),
        top.heightAnchor.constraint(equalTo: bottom.heightAnchor, multiplier: 2.2),
        bottom.heightAnchor.constraint(greaterThanOrEqualToConstant: 24),
      ])
    } else {
      NSLayoutConstraint.activate([
        stack.centerYAnchor.constraint(equalTo: wrap.centerYAnchor),
        top.heightAnchor.constraint(equalTo: bottom.heightAnchor),
      ])
    }
    return wrap
  }

  private func hideCapacitorSplash() {
    NotificationCenter.default.post(name: Notification.Name("splashScreenHide"), object: nil)
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

enum DibayStartupConfigCache {
  private static let dirName = "startup"
  private static let configActive = "startup-config.json"
  private static let logoActive = "startup-logo.bin"
  private static let bgActive = "startup-background.bin"

  static func loadActive() -> [String: Any] {
    let url = directory().appendingPathComponent(configActive)
    guard let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return defaultConfig()
    }
    return obj
  }

  static func persist(json: String) {
    DispatchQueue.global(qos: .utility).async {
      guard let data = json.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
      let dir = directory()
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let stagingConfig = dir.appendingPathComponent("startup-config.staging.json")
      try? data.write(to: stagingConfig, options: .atomic)

      var logoOk = true
      var bgOk = true
      if let logoUrl = httpURL(obj["logoUrl"] as? String) {
        logoOk = download(logoUrl, to: dir.appendingPathComponent("startup-logo.staging.bin"))
      } else {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("startup-logo.staging.bin"))
      }
      if (obj["backgroundType"] as? String) == "image", let bgUrl = httpURL(obj["backgroundImageUrl"] as? String) {
        bgOk = download(bgUrl, to: dir.appendingPathComponent("startup-background.staging.bin"))
      } else {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("startup-background.staging.bin"))
      }
      guard logoOk && bgOk else {
        NSLog("[DIBAY_Startup] persist_assets_incomplete")
        return
      }
      let activeConfig = dir.appendingPathComponent(configActive)
      try? FileManager.default.removeItem(at: activeConfig)
      try? FileManager.default.moveItem(at: stagingConfig, to: activeConfig)
      if httpURL(obj["logoUrl"] as? String) != nil {
        let st = dir.appendingPathComponent("startup-logo.staging.bin")
        let ac = dir.appendingPathComponent(logoActive)
        try? FileManager.default.removeItem(at: ac)
        try? FileManager.default.moveItem(at: st, to: ac)
      } else {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(logoActive))
      }
      if (obj["backgroundType"] as? String) == "image", httpURL(obj["backgroundImageUrl"] as? String) != nil {
        let st = dir.appendingPathComponent("startup-background.staging.bin")
        let ac = dir.appendingPathComponent(bgActive)
        try? FileManager.default.removeItem(at: ac)
        try? FileManager.default.moveItem(at: st, to: ac)
      } else {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(bgActive))
      }
      let surface = (obj["initialSurface"] as? String) ?? "community"
      UserDefaults.standard.set(surface, forKey: "dibay_initial_surface")
      NSLog("[DIBAY_Startup] persist_ok surface=%@", surface)
    }
  }

  static func loadLogoImage() -> UIImage? {
    let url = directory().appendingPathComponent(logoActive)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
  }

  static func loadBackgroundImage() -> UIImage? {
    let url = directory().appendingPathComponent(bgActive)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
  }

  static func logoWidth(config: [String: Any]) -> CGFloat {
    let preset = (config["logoWidthPreset"] as? String) ?? "medium"
    if preset == "small" { return 56 }
    if preset == "large" { return 96 }
    if preset == "custom" {
      let c = (config["logoCustomWidthPx"] as? Int) ?? 72
      return CGFloat(min(160, max(40, c)))
    }
    return 72
  }

  static func clampDuration(_ ms: Int) -> Int {
    min(1200, max(150, ms))
  }

  static func color(from hex: String?, fallback: UIColor) -> UIColor {
    guard var h = hex?.trimmingCharacters(in: .whitespacesAndNewlines), h.hasPrefix("#") else { return fallback }
    h.removeFirst()
    guard h.count == 6 || h.count == 8, let v = UInt64(h, radix: 16) else { return fallback }
    if h.count == 6 {
      return UIColor(
        red: CGFloat((v >> 16) & 0xff) / 255,
        green: CGFloat((v >> 8) & 0xff) / 255,
        blue: CGFloat(v & 0xff) / 255,
        alpha: 1
      )
    }
    return UIColor(
      red: CGFloat((v >> 24) & 0xff) / 255,
      green: CGFloat((v >> 16) & 0xff) / 255,
      blue: CGFloat((v >> 8) & 0xff) / 255,
      alpha: CGFloat(v & 0xff) / 255
    )
  }

  private static func directory() -> URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(dirName)
  }

  private static func httpURL(_ raw: String?) -> URL? {
    guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
          raw.hasPrefix("http://") || raw.hasPrefix("https://") else { return nil }
    return URL(string: raw)
  }

  private static func download(_ url: URL, to dest: URL) -> Bool {
    let sem = DispatchSemaphore(value: 0)
    var ok = false
    let task = URLSession.shared.dataTask(with: url) { data, response, _ in
      defer { sem.signal() }
      guard let data = data, data.count > 0, data.count < 3_000_000,
            let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
      do {
        try data.write(to: dest, options: .atomic)
        ok = true
      } catch {
        ok = false
      }
    }
    task.resume()
    _ = sem.wait(timeout: .now() + 25)
    return ok
  }

  private static func defaultConfig() -> [String: Any] {
    [
      "version": 2,
      "initialSurface": "community",
      "backgroundType": "solid",
      "backgroundColor": "#FFFCFC",
      "logoSource": "default",
      "logoWidthPreset": "medium",
      "logoVertical": "center",
      "wordmark": "DIBAY",
      "showWordmark": true,
      "showSpinner": true,
      "enterAnimation": "fade_in",
      "exitAnimation": "fade_out",
      "ambientAnimation": "none",
      "enterDurationMs": 280,
      "exitDurationMs": 220,
    ]
  }
}
