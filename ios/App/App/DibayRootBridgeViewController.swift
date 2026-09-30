import Capacitor
import UIKit
import WebKit

/**
 * Cap root host for REBUILD 14 P7.
 *
 * Owns:
 * - FD3 app-shell orientation (DeviceClass)
 * - WebView keyboard chrome install
 * - ONE DibayStartupCompositorHost cold lifecycle (SYSTEM START → INTRO → HOME)
 *
 * Does NOT resurrect StartupBridge, cream fallback, or a second product window.
 */
class DibayRootBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
  private var compositorFirstProductFrame = false
  private var compositorSkipped = false
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
    DibayWebViewKeyboardChrome.install(on: webView)
    installBootBridgeIfNeeded()
    startStartupCompositor()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    DibayWebViewKeyboardChrome.install(on: webView)
    DibayStartupCompositorHost.peek()?.onForeground()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    DibayStartupCompositorHost.peek()?.onBackground()
  }

  private func installBootBridgeIfNeeded() {
    guard !bootBridgeInstalled, let wv = webView else { return }
    wv.configuration.userContentController.add(self, name: "DibayBootBridge")
    bootBridgeInstalled = true
  }

  private func startStartupCompositor() {
    guard DibayStartupCompositorHost.productionPresentationActive else {
      compositorSkipped = true
      return
    }
    let host = DibayStartupCompositorHost.getOrCreate(rootView: view)
    host.startCold(
      onFirstFrame: { [weak self] in
        self?.compositorFirstProductFrame = true
        NSLog("[DibayRootBridge] startup_compositor_first_product_frame")
      },
      onSkipped: { [weak self] reason in
        self?.compositorSkipped = true
        NSLog("[DibayRootBridge] startup_compositor_skipped reason=%@", reason)
      },
      onHandoff: {
        NSLog("[DibayRootBridge] startup_compositor_handoff_complete")
      }
    )
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
      DibayStartupCompositorHost.peek()?.ingestHomePresentationReady("DibayBootBridge")
    }
  }
}
