import UIKit
import WebKit
import ObjectiveC

/**
 * iOS WKWebView keyboard chrome:
 * 1) Hide the system form accessory bar (^ / v / ✓) above the software keyboard.
 * 2) Publish keyboard∩WebView bottom inset to `window.samarketShell` (CSS px).
 *
 * Does not change Android. Does not touch call / AppDelegate signaling.
 * Keeps `contentInsetAdjustmentBehavior = .never` so CM room Telegram overlay
 * parity stays on visualViewport (not UIKit inset resizing).
 */
enum DibayWebViewKeyboardChrome {
  private static var didInstallAccessoryHide = false
  private static var keyboardObservers: [NSObjectProtocol] = []
  private static weak var trackedWebView: WKWebView?
  private static var lastPublishedInsetCssPx: Int = -1

  static func install(on webView: WKWebView?) {
    guard let webView else { return }
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.alwaysBounceVertical = false
    hideInputAccessoryBarOnce()
    beginTrackingKeyboardInsets(on: webView)
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

  private static func beginTrackingKeyboardInsets(on webView: WKWebView) {
    trackedWebView = webView
    if !keyboardObservers.isEmpty { return }

    let center = NotificationCenter.default
    let change = center.addObserver(
      forName: UIResponder.keyboardWillChangeFrameNotification,
      object: nil,
      queue: .main
    ) { note in
      handleKeyboardFrameNotification(note, forceZero: false)
    }
    let hide = center.addObserver(
      forName: UIResponder.keyboardWillHideNotification,
      object: nil,
      queue: .main
    ) { note in
      handleKeyboardFrameNotification(note, forceZero: true)
    }
    keyboardObservers = [change, hide]
  }

  private static func handleKeyboardFrameNotification(_ note: Notification, forceZero: Bool) {
    let durationMs = keyboardDurationMs(from: note)
    if forceZero {
      publishInsetCssPx(0, durationMs: durationMs)
      return
    }
    guard let endFrame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
      publishInsetCssPx(0, durationMs: durationMs)
      return
    }
    let inset = intersectionBottomInsetCssPx(keyboardFrameInScreen: endFrame)
    publishInsetCssPx(inset, durationMs: durationMs)
  }

  /**
   * Keyboard frame is screen coords. Convert into the WebView's coordinate space and
   * measure the overlapping height that actually covers the WebView bottom.
   * UIKit points == CSS px for WKWebView layout on iOS.
   */
  private static func intersectionBottomInsetCssPx(keyboardFrameInScreen: CGRect) -> Int {
    guard let webView = trackedWebView else { return 0 }
    let kbInWeb = webView.convert(keyboardFrameInScreen, from: nil)
    let webBounds = webView.bounds
    let intersection = webBounds.intersection(kbInWeb)
    if intersection.isNull || intersection.isEmpty { return 0 }
    // Only count overlap that sits on the bottom edge of the WebView (keyboard chrome).
    let coversBottom = intersection.maxY >= webBounds.maxY - 1.0
    if !coversBottom { return 0 }
    return max(0, Int(round(intersection.height)))
  }

  private static func keyboardDurationMs(from note: Notification) -> Int {
    let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0
    return max(0, Int(round(duration * 1000)))
  }

  private static func publishInsetCssPx(_ insetCssPx: Int, durationMs: Int) {
    let clamped = max(0, insetCssPx)
    if clamped == lastPublishedInsetCssPx { return }
    lastPublishedInsetCssPx = clamped
    guard let webView = trackedWebView else { return }

    let visibleLiteral = clamped > 0 ? "true" : "false"
    let js = """
    (function(){
      try {
        window.samarketShell = window.samarketShell || {};
        window.samarketShell.keyboardBottomInsetCssPx = \(clamped);
        window.dispatchEvent(new CustomEvent('samarket:shell-keyboard', {
          detail: {
            bottomInsetCssPx: \(clamped),
            visible: \(visibleLiteral),
            durationMs: \(durationMs)
          }
        }));
      } catch (e) {}
    })();
    """
    webView.evaluateJavaScript(js, completionHandler: { _, _ in
      /* never crash the app on JS failures */
    })
  }
}
