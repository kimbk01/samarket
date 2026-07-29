import UIKit
import WebKit
import ObjectiveC

/**
 * iOS WKWebView keyboard chrome — Telegram-like:
 * hide the system form accessory bar (^ / v / ✓) above the software keyboard.
 * Does not change Android. Does not touch call / AppDelegate signaling.
 */
enum DibayWebViewKeyboardChrome {
  private static var didInstallAccessoryHide = false

  static func install(on webView: WKWebView?) {
    guard let webView else { return }
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.alwaysBounceVertical = false
    hideInputAccessoryBarOnce()
  }

  /// Swizzle WKContentView.inputAccessoryView → nil (prev/next/done toolbar).
  private static func hideInputAccessoryBarOnce() {
    if didInstallAccessoryHide { return }
    didInstallAccessoryHide = true

    guard let contentViewClass = NSClassFromString("WKContentView") else { return }
    let selector = NSSelectorFromString("inputAccessoryView")
    guard let method = class_getInstanceMethod(contentViewClass, selector) else { return }

    let block: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
    let imp = imp_implementationWithBlock(block)
    method_setImplementation(method, imp)
  }
}
