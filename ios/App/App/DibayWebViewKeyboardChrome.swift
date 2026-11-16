import UIKit
import WebKit
import ObjectiveC

/**
 * iOS WKWebView keyboard chrome — Telegram-like:
 * - hide the system form accessory bar (^ / v / ✓) above the software keyboard.
 * - hide the hardware-keyboard shortcuts bar (undo · paste · B/I/U · ∧∨). On Mac
 *   (Designed for iPad) and iPad with a hardware keyboard UIKit draws it as a 44pt bar
 *   at the window bottom (`UITextEffectsWindow` › `UIInputSetHostView`), reports it as
 *   the keyboard (web content is pushed up) and it swallows clicks on the bottom tab.
 *   Measured 2026-11-16 — `docs/audit/mac-bottom-gray-bar-full-audit-2026-11-16.md` §2.
 * Does not change Android. Does not touch call / AppDelegate signaling.
 */
enum DibayWebViewKeyboardChrome {
  private static var didInstallAccessoryHide = false
  private static var didInstallAssistantHide = false

  static func install(on webView: WKWebView?) {
    guard let webView else { return }
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.alwaysBounceVertical = false
    hideInputAccessoryBarOnce()
    hideInputAssistantBarOnce()
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

  /// WKContentView.inputAssistantItem → same item with no leading/trailing bar button groups.
  /// An item without groups makes UIKit draw no shortcuts bar (bar height 44 → 0, measured).
  /// The override is added on WKContentView only — never on UIResponder (other text inputs untouched).
  private static func hideInputAssistantBarOnce() {
    if didInstallAssistantHide { return }
    didInstallAssistantHide = true

    guard let contentViewClass = NSClassFromString("WKContentView") else { return }
    let selector = #selector(getter: UIResponder.inputAssistantItem)
    guard let method = class_getInstanceMethod(contentViewClass, selector) else { return }

    typealias Getter = @convention(c) (AnyObject, Selector) -> UITextInputAssistantItem
    let original = unsafeBitCast(method_getImplementation(method), to: Getter.self)
    let block: @convention(block) (AnyObject) -> UITextInputAssistantItem = { contentView in
      let item = original(contentView, selector)
      if !item.leadingBarButtonGroups.isEmpty { item.leadingBarButtonGroups = [] }
      if !item.trailingBarButtonGroups.isEmpty { item.trailingBarButtonGroups = [] }
      return item
    }
    let imp = imp_implementationWithBlock(block)
    if !class_addMethod(contentViewClass, selector, imp, method_getTypeEncoding(method)) {
      method_setImplementation(method, imp)
    }
  }
}
