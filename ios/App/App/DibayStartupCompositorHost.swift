import UIKit

/**
 * REBUILD 14 P2 — thin iOS Startup Compositor host.
 *
 * Duties ONLY: create/attach/detach one compositor surface in the existing root;
 * forward lifecycle, first-frame, HOME_PRESENTATION_READY, yield.
 *
 * Must not own package/generation policy, timers, product/failure visuals,
 * a second window/product VC, Cap splash, or WebView visibility workarounds.
 *
 * PRODUCTION_PRESENTATION_ACTIVE = false — not Owner-visible; root VC MUST NOT
 * wire this host into presentation ownership until P7+ with valid content.
 */
@objc final class DibayStartupCompositorHost: NSObject {
  static let tag = "DibayStartupCompositor"

  /// Frozen P2 activation boundary. Structural only; Production presentation = NO.
  static let productionPresentationActive = false

  private static var instance: DibayStartupCompositorHost?

  private weak var rootView: UIView?
  private var surface: UIView?
  private var attached = false
  private var detached = false
  private var homeReadyForwarded = false
  private var handoffComplete = false
  private var destroyed = false

  private override init() {
    super.init()
  }

  @objc static func getOrCreate(rootView: UIView) -> DibayStartupCompositorHost {
    if let existing = instance, !existing.destroyed, existing.rootView === rootView {
      return existing
    }
    if let existing = instance, !existing.destroyed {
      existing.destroy()
    }
    let host = DibayStartupCompositorHost()
    host.rootView = rootView
    instance = host
    return host
  }

  @objc static func peek() -> DibayStartupCompositorHost? {
    instance
  }

  @objc static func resetForTests() {
    instance?.destroy()
    instance = nil
  }

  /**
   * Attach one invisible structural surface. Does NOT paint product content.
   * Production callers must not Owner-present while productionPresentationActive is false
   * (P2 keeps DibayRootBridgeViewController unwired).
   */
  @objc func attach() {
    guard !destroyed, !attached, let root = rootView else { return }
    let view = UIView(frame: root.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = false
    view.isHidden = true
    view.backgroundColor = .clear
    view.accessibilityIdentifier = DibayStartupCompositorHost.tag
    root.addSubview(view)
    surface = view
    attached = true
    NSLog(
      "[%@] attach ok productionPresentationActive=%@",
      DibayStartupCompositorHost.tag,
      DibayStartupCompositorHost.productionPresentationActive ? "true" : "false"
    )
  }

  @objc func forwardHomePresentationReady(_ source: String?) {
    guard !destroyed, !homeReadyForwarded else { return }
    homeReadyForwarded = true
    NSLog(
      "[%@] HOME_PRESENTATION_READY forwarded source=%@",
      DibayStartupCompositorHost.tag,
      source ?? "unknown"
    )
  }

  @objc func requestHandoffYield() {
    guard !destroyed, !handoffComplete else { return }
    handoffComplete = true
    detach()
    NSLog("[%@] handoff_yield complete", DibayStartupCompositorHost.tag)
  }

  @objc func detach() {
    guard !destroyed, !detached else { return }
    surface?.removeFromSuperview()
    surface = nil
    attached = false
    detached = true
  }

  @objc func onForeground() {
    // Must not create a second surface / authority.
  }

  @objc func onBackground() {
    // Must not create a second surface / authority.
  }

  @objc func destroy() {
    guard !destroyed else { return }
    detach()
    destroyed = true
    if DibayStartupCompositorHost.instance === self {
      DibayStartupCompositorHost.instance = nil
    }
  }

  @objc var isAttached: Bool {
    attached && surface != nil
  }

  @objc var isDestroyed: Bool {
    destroyed
  }

  @objc var surfaceCount: Int {
    attached && surface != nil ? 1 : 0
  }
}
