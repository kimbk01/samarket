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
      deviceClass: DibayDeviceClassClassifier.classify().deviceClass,
      adminLandscape: adminLandscape
    )
  }

  /**
   * Admin v4 §2-2 C — set by DibayAppOrientationPlugin while the web admin shell is mounted.
   * Only TABLET_IPAD turns this into `.landscape` (DibayAppOrientationPolicy). Phones unchanged.
   * Reset when a new top-level document starts loading so a lock cannot survive reload/crash.
   */
  private(set) var adminLandscape = false
  private var adminLandscapeLoadingObservation: NSKeyValueObservation?

  /** Main thread only. */
  func setAdminLandscape(_ enabled: Bool) {
    guard adminLandscape != enabled else { return }
    adminLandscape = enabled
    NSLog("[DibayRootBridge] admin_landscape=%@", enabled ? "on" : "off")
    applySupportedInterfaceOrientationsChange(requestLandscape: enabled)
  }

  private func applySupportedInterfaceOrientationsChange(requestLandscape: Bool) {
    if #available(iOS 16.0, *) {
      setNeedsUpdateOfSupportedInterfaceOrientations()
      guard requestLandscape,
        DibayDeviceClassClassifier.classify().deviceClass == "TABLET_IPAD",
        let windowScene = view.window?.windowScene
      else { return }
      windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscape)) { error in
        NSLog("[DibayRootBridge] admin_landscape_geometry_update_failed err=%@", String(describing: error))
      }
    } else {
      // iOS 15: no private API — rotation happens when the user turns the device.
      UIViewController.attemptRotationToDeviceOrientation()
    }
  }

  private func installAdminLandscapeResetOnPageLoad() {
    guard adminLandscapeLoadingObservation == nil, let wv = webView else { return }
    adminLandscapeLoadingObservation = wv.observe(\.isLoading, options: [.new]) { [weak self] _, change in
      guard change.newValue == true else { return }
      DispatchQueue.main.async {
        self?.setAdminLandscape(false)
        self?.setBackSwipeEnabled(false)
      }
    }
  }

  /**
   * 화면 가장자리 스와이프 뒤로가기 — DibayBackSwipePlugin 이 켤 때만(커뮤니티 글쓰기 작성기).
   * 기본 꺼짐 · 새 문서 로드 시 다시 꺼짐(위 isLoading 관찰). Main thread only.
   */
  private(set) var backSwipeEnabled = false

  func setBackSwipeEnabled(_ enabled: Bool) {
    guard backSwipeEnabled != enabled else { return }
    backSwipeEnabled = enabled
    webView?.allowsBackForwardNavigationGestures = enabled
    NSLog("[DibayRootBridge] back_swipe=%@", enabled ? "on" : "off")
  }

  /**
   * INTRO every_launch identity — one UUID per native app process. Static: survives WKWebView
   * document reload and web-content-process recreation (Capacitor reloads the same WKWebView,
   * whose user scripts persist); a new app process gets a new value.
   * Identity only: no Intro renderer / cache / navigation / timer / business logic here.
   */
  static let launchEpoch = UUID().uuidString

  /**
   * Lifecycle SSOT — restore | fresh | unknown.
   * Set from AppDelegate before first document. Do not invent restore from background alone.
   */
  static var nativeRestoreHint: String = "unknown"

  /**
   * capacitorDidLoad() runs inside loadView(), before viewDidLoad() → loadWebView() issues the
   * first navigation: App-target plugins are registered and the launch epoch user script is
   * installed before the very first document runs.
   */
  override func capacitorDidLoad() {
    super.capacitorDidLoad()
    registerAppTargetPlugins()
    installLaunchEpoch()
    installStartupFaultNavigationProxy()
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
      // App-shell orientation route mode (admin landscape, v4 §2-2 C)
      DibayAppOrientationPlugin(),
      // App language → native store (언어 SSOT S8-1 — store only, no behavior change)
      DibayAppLanguagePlugin(),
      // Edge swipe back — on only while a web screen asks (community write composer)
      DibayBackSwipePlugin(),
      // Apple in-app purchase (StoreKit 2 · Point top-up)
      DibayStoreKitPlugin(),
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

  /** Installs launch epoch + native restore hint at document start. */
  private func installLaunchEpoch() {
    guard let controller = webView?.configuration.userContentController else {
      NSLog("[DibayRootBridge] launch_epoch_not_installed reason=no_webview")
      return
    }
    let hint = Self.nativeRestoreHint
    let source =
      "Object.defineProperty(window,'__DIBAY_LAUNCH_EPOCH__',{value:'\(Self.launchEpoch)',writable:false,enumerable:false,configurable:false});"
      + "Object.defineProperty(window,'__DIBAY_NATIVE_RESTORE_HINT__',{value:'\(hint)',writable:false,enumerable:false,configurable:false});"
    controller.addUserScript(
      WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    NSLog("[DibayRootBridge] launch_epoch_installed epoch=%@ restore_hint=%@", Self.launchEpoch, hint)
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    purgeObsoleteIntroSystemStartLocalStateOnce()
    DibayWebViewKeyboardChrome.install(on: webView)
    // Continuation first, then the message handler: no dismiss can arrive before it exists.
    installLaunchContinuationIfNeeded()
    installBootBridgeIfNeeded()
    installAdminLandscapeResetOnPageLoad()
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
        // C7: 앱 번들이 시작되지 않은 채 로드가 멈췄다(탐색 실패·평문 오류 문서) — 빈 화면 대신 오류 안내 + 「다시 시도」.
        self.showStartupErrorView(kind: .network, reason: "main_load_stopped_without_app")
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
      stopStartupFaultProbe()
      return
    }
    if action == "homePresentationReady" || action.lowercased().contains("homepresentationready") {
      NSLog("[DibayRootBridge] homePresentationReady (no Intro/System Start authority)")
    }
  }

  // MARK: - C7 시작 화면 고장 판정 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C7 · Owner D1)
  //
  // 해제 권한은 둘뿐: ① 웹 dismissSplash(정상, 그대로) ② 아래 고장 판정. 표시 시간 타이머가 아니다 — 정상 시작은 웹 신호가
  // 먼저 와서 관찰이 끝난다. 시간은 앱이 활성일 때만 센다. 자동 재로드는 1회, 그다음은 오류 화면의 「다시 시도」만.
  // 판정 규칙·값은 Android DibayStartupFaultPolicy 와 같다 (T_js 8초 · T_release 15초 · 통화 경로 자동 재로드 금지).

  static let startupFaultJsTimeoutMs = 8_000
  static let startupFaultReleaseTimeoutMs = 15_000
  private static let startupFaultTickMs = 1_000
  private static let startupJsRunningProbe =
    "(function(){try{var m=window.__dibayBootMetrics;return !!(m&&m.reactMounted!=null);}catch(e){return false;}})()"

  private var startupNavigationProxy: DibayNavigationDelegateProxy?
  private var startupFaultProbe: Timer?
  private var startupFaultDocVisibleMs = 0
  private var startupFaultJsVisibleMs = -1
  private var startupFaultAutoReloads = 0
  private var startupErrorView: UIView?

  /// Capacitor 의 WebViewDelegationHandler 를 감싸 문서 시작·완료·실패·WebContent 종료만 먼저 본다. 나머지는 그대로 전달.
  private func installStartupFaultNavigationProxy() {
    guard startupNavigationProxy == nil, let wv = webView, let inner = wv.navigationDelegate else {
      NSLog("[DibayRootBridge] startup_fault_proxy_not_installed")
      return
    }
    let proxy = DibayNavigationDelegateProxy(inner: inner, owner: self)
    startupNavigationProxy = proxy // navigationDelegate 는 weak — 강하게 붙잡는다
    wv.navigationDelegate = proxy
    NSLog("[DibayRootBridge] startup_fault_proxy_installed")
  }

  func startupFaultDocumentStarted() {
    stopStartupFaultProbe()
  }

  func startupFaultDocumentFinished() {
    stopStartupFaultProbe()
    guard launchContinuation != nil else { return } // 이미 해제됨 — 관찰 대상 아님
    let docURL = webView?.url?.absoluteString
    let timer = Timer(timeInterval: Double(Self.startupFaultTickMs) / 1000.0, repeats: true) { [weak self] _ in
      self?.tickStartupFaultProbe(docURL: docURL)
    }
    RunLoop.main.add(timer, forMode: .common)
    startupFaultProbe = timer
  }

  private func stopStartupFaultProbe() {
    startupFaultProbe?.invalidate()
    startupFaultProbe = nil
    startupFaultDocVisibleMs = 0
    startupFaultJsVisibleMs = -1
  }

  private func tickStartupFaultProbe(docURL: String?) {
    guard launchContinuation != nil else {
      stopStartupFaultProbe()
      return
    }
    guard UIApplication.shared.applicationState == .active else { return }
    startupFaultDocVisibleMs += Self.startupFaultTickMs
    if startupFaultJsVisibleMs >= 0 { startupFaultJsVisibleMs += Self.startupFaultTickMs }
    guard let wv = webView else {
      decideStartupFault(docURL: docURL)
      return
    }
    wv.evaluateJavaScript(Self.startupJsRunningProbe) { [weak self] result, _ in
      guard let self = self else { return }
      if (result as? Bool) == true, self.startupFaultJsVisibleMs < 0 { self.startupFaultJsVisibleMs = 0 }
      self.decideStartupFault(docURL: docURL)
    }
  }

  private func decideStartupFault(docURL: String?) {
    guard startupFaultProbe != nil, launchContinuation != nil else { return }
    let noJs = startupFaultJsVisibleMs < 0 && startupFaultDocVisibleMs >= Self.startupFaultJsTimeoutMs
    let notReleased = startupFaultJsVisibleMs >= Self.startupFaultReleaseTimeoutMs
    guard noJs || notReleased else { return }
    let reason = noJs ? "WEB_NOT_READY" : "WEB_NOT_RELEASED"
    stopStartupFaultProbe()
    let callRoute = (docURL ?? "").lowercased().contains("call")
    NSLog(
      "[DibayRootBridge] startup_fault reason=%@ autoReloads=%d callRoute=%@",
      reason, startupFaultAutoReloads, callRoute ? "1" : "0")
    if !callRoute && startupFaultAutoReloads < 1, let wv = webView {
      startupFaultAutoReloads += 1
      wv.reload()
      return
    }
    showStartupErrorView(kind: .web, reason: reason)
  }

  func startupFaultLoadFailed(_ error: Error) {
    let ns = error as NSError
    // 정상 흐름의 취소(다른 이동으로 대체)·정책 중단은 실패가 아니다.
    if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
    if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return }
    // 앱이 이미 화면을 그리고 있으면(시작 화면 해제 후) 여기서 덮지 않는다.
    guard launchContinuation != nil || webView?.url == nil else { return }
    stopStartupFaultProbe()
    let offlineCodes: Set<Int> = [
      NSURLErrorNotConnectedToInternet, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost,
      NSURLErrorNetworkConnectionLost, NSURLErrorDNSLookupFailed, NSURLErrorDataNotAllowed,
    ]
    let offline = ns.domain == NSURLErrorDomain && offlineCodes.contains(ns.code)
    showStartupErrorView(kind: offline ? .offline : .network, reason: "\(ns.domain)#\(ns.code)")
  }

  /// WebContent 종료(장시간 백그라운드 등) → Capacitor 가 reload 한다. 그 사이 빈 화면 대신 같은 시작 화면을 다시 덮고,
  /// 새 문서도 같은 고장 판정을 받는다.
  func startupFaultContentProcessTerminated() {
    stopStartupFaultProbe()
    hideStartupErrorView()
    installLaunchContinuationIfNeeded()
    NSLog("[DibayRootBridge] webcontent_terminated_continuation_reinstalled")
  }

  enum StartupErrorKind { case offline, network, web }

  private func showStartupErrorView(kind: StartupErrorKind, reason: String) {
    removeLaunchContinuation(reason: "startup_fault_\(reason)")
    hideStartupErrorView()
    guard let host = view else { return }
    let en = (Locale.preferredLanguages.first ?? "ko").lowercased().hasPrefix("en")
    let title: String
    let body: String
    switch kind {
    case .offline:
      title = en ? "You're offline" : "인터넷에 연결되어 있지 않습니다"
      body = en ? "Check your internet connection and tap Try again." : "연결을 확인한 뒤 다시 시도를 눌러 주세요."
    case .network:
      title = en ? "Can't connect to the server" : "서버에 연결할 수 없습니다"
      body = en ? "Check your network connection and try again." : "네트워크 연결을 확인한 뒤 다시 시도해 주세요."
    case .web:
      title = en ? "The app screen didn't load" : "앱 화면을 불러오지 못했습니다"
      body = en ? "Tap Try again to load it again." : "다시 시도를 누르면 다시 불러옵니다."
    }
    let container = UIView(frame: host.bounds)
    container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.backgroundColor = UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0) // #FFFCFC
    container.accessibilityViewIsModal = true

    let titleLabel = UILabel()
    titleLabel.text = title
    titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    titleLabel.textColor = UIColor(red: 0.212, green: 0.141, blue: 0.082, alpha: 1.0) // #362415
    titleLabel.textAlignment = .center
    titleLabel.numberOfLines = 0

    let bodyLabel = UILabel()
    bodyLabel.text = body
    bodyLabel.font = .systemFont(ofSize: 14)
    bodyLabel.textColor = UIColor(red: 0.376, green: 0.298, blue: 0.298, alpha: 1.0) // #604C4C
    bodyLabel.textAlignment = .center
    bodyLabel.numberOfLines = 0

    let button = UIButton(type: .system)
    button.setTitle(en ? "Try again" : "다시 시도", for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
    button.setTitleColor(UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0), for: .normal)
    button.backgroundColor = UIColor(red: 0.043, green: 0.259, blue: 0.102, alpha: 1.0) // #0B421A
    button.layer.cornerRadius = 4
    button.contentEdgeInsets = UIEdgeInsets(top: 10, left: 24, bottom: 10, right: 24)
    button.addTarget(self, action: #selector(onStartupErrorRetry), for: .touchUpInside)

    let stack = UIStackView(arrangedSubviews: [titleLabel, bodyLabel, button])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 12
    stack.setCustomSpacing(28, after: bodyLabel)
    stack.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: container.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -24),
      stack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
    ])
    host.addSubview(container)
    startupErrorView = container
    NSLog("[DibayRootBridge] startup_error_view_shown kind=%@ reason=%@", "\(kind)", reason)
  }

  private func hideStartupErrorView() {
    startupErrorView?.removeFromSuperview()
    startupErrorView = nil
  }

  /// 「다시 시도」 = 실제 재로드. 불러오는 동안 같은 시작 화면을 덮고, 새 문서는 다시 고장 판정을 받는다(자동 재로드는 이미 썼으면 없음).
  @objc private func onStartupErrorRetry() {
    hideStartupErrorView()
    installLaunchContinuationIfNeeded()
    guard let wv = webView else { return }
    if wv.url != nil {
      wv.reload()
    } else if let server = bridge?.config.serverURL {
      _ = wv.load(URLRequest(url: server))
    }
    NSLog("[DibayRootBridge] startup_error_retry")
  }
}

/// C7 — Capacitor `WebViewDelegationHandler` 를 감싸는 navigation delegate.
/// `loadView` 가 final 이라 handler 를 바꿀 수 없어, 같은 객체에 모든 호출을 전달하고 4가지 사건만 먼저 본다.
/// 구현하지 않은 선택자는 `forwardingTarget` 으로 원래 handler 에 그대로 간다 (Capacitor 동작 불변).
/// 유지 위험: Capacitor 가 navigationDelegate 를 다시 설정하도록 바뀌면 이 프록시가 빠진다 — Capacitor 업그레이드 때 확인.
final class DibayNavigationDelegateProxy: NSObject, WKNavigationDelegate {
  private let inner: WKNavigationDelegate
  private weak var owner: DibayRootBridgeViewController?

  init(inner: WKNavigationDelegate, owner: DibayRootBridgeViewController) {
    self.inner = inner
    self.owner = owner
    super.init()
  }

  override func responds(to aSelector: Selector!) -> Bool {
    super.responds(to: aSelector) || inner.responds(to: aSelector)
  }

  override func forwardingTarget(for aSelector: Selector!) -> Any? {
    inner.responds(to: aSelector) ? inner : nil
  }

  func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
    owner?.startupFaultDocumentStarted()
    inner.webView?(webView, didStartProvisionalNavigation: navigation)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    inner.webView?(webView, didFinish: navigation)
    owner?.startupFaultDocumentFinished()
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    inner.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    owner?.startupFaultLoadFailed(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    inner.webView?(webView, didFail: navigation, withError: error)
    owner?.startupFaultLoadFailed(error)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    owner?.startupFaultContentProcessTerminated()
    inner.webViewWebContentProcessDidTerminate?(webView)
  }
}
