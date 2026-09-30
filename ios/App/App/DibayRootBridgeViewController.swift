import Capacitor
import UIKit

/**
 * Cap root host for REBUILD 14 ZERO BASELINE.
 *
 * Owns only non-product shell duties:
 * - FD3 app-shell orientation (DeviceClass)
 * - WebView keyboard chrome install
 *
 * Does NOT own System Start, Intro, Cap product splash, hold, cream fallback,
 * or any competing startup presentation surface.
 */
class DibayRootBridgeViewController: CAPBridgeViewController {
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
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    DibayWebViewKeyboardChrome.install(on: webView)
  }
}
