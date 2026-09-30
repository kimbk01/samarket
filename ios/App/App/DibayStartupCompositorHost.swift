import UIKit

/**
 * REBUILD 14 P7 — iOS Startup Compositor host + cold session.
 *
 * PLATFORM BOOT → ONE surface → SYSTEM START → optional INTRO → HOME → one HANDOFF.
 * Canonical package = StartupPackageEnvelope (not pack.json authority).
 * GIF/MP4 native playback = OPEN / NOT_PROVEN.
 */
@objc final class DibayStartupCompositorHost: NSObject {
  static let tag = "DibayStartupCompositor"

  /// P7: production presentation path is active when OWNER envelope present.
  static let productionPresentationActive = true

  private static var instance: DibayStartupCompositorHost?

  private weak var rootView: UIView?
  private var surface: UIView?
  private var attached = false
  private var detached = false
  private var homeReadyForwarded = false
  private var handoffComplete = false
  private var destroyed = false
  private var firstFrameLogged = false
  private var ownerVisibleLogged = false

  // Session state
  private var started = false
  private var skipped = false
  private var firstProductFrame = false
  private var homeReady = false
  private var introComplete = false
  private var envelope: [String: Any]?
  private var introScenes: [[String: Any]] = []
  private var sceneIndex = 0
  private var minVisibleMs: Int = 800
  private var sceneWorkItem: DispatchWorkItem?
  private var onFirstFrame: (() -> Void)?
  private var onSkipped: ((String) -> Void)?
  private var onHandoff: (() -> Void)?

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

  @objc func attach() {
    guard !destroyed, !attached, let root = rootView else { return }
    let view = UIView(frame: root.bounds)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.isUserInteractionEnabled = true
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

  @objc func setSurfaceVisible(_ visible: Bool) {
    surface?.isHidden = !visible
  }

  @objc func notifyPaintable() {
    NSLog("[%@] PAINTABLE", DibayStartupCompositorHost.tag)
  }

  @objc func notifyFirstFrameCommitted() {
    guard !firstFrameLogged else { return }
    firstFrameLogged = true
    NSLog("[%@] FIRST_FRAME_COMMITTED", DibayStartupCompositorHost.tag)
  }

  @objc func notifyOwnerVisible() {
    guard !ownerVisibleLogged else { return }
    ownerVisibleLogged = true
    NSLog("[%@] OWNER_VISIBLE", DibayStartupCompositorHost.tag)
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

  @objc func onForeground() {}
  @objc func onBackground() {}

  @objc func destroy() {
    guard !destroyed else { return }
    sceneWorkItem?.cancel()
    detach()
    destroyed = true
    if DibayStartupCompositorHost.instance === self {
      DibayStartupCompositorHost.instance = nil
    }
  }

  @objc var isAttached: Bool { attached && surface != nil }
  @objc var isDestroyed: Bool { destroyed }
  @objc var surfaceCount: Int { attached && surface != nil ? 1 : 0 }

  // MARK: - Cold session

  func startCold(
    onFirstFrame: @escaping () -> Void,
    onSkipped: @escaping (String) -> Void,
    onHandoff: @escaping () -> Void
  ) {
    guard !started else { return }
    started = true
    self.onFirstFrame = onFirstFrame
    self.onSkipped = onSkipped
    self.onHandoff = onHandoff
    guard DibayStartupCompositorHost.productionPresentationActive else {
      skip("production_presentation_inactive")
      return
    }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let env = Self.loadVerifiedOwnerEnvelope()
      DispatchQueue.main.async {
        self?.begin(with: env)
      }
    }
  }

  func ingestHomePresentationReady(_ source: String?) {
    homeReady = true
    forwardHomePresentationReady(source)
    maybeHandoff(reason: "home_ready:\(source ?? "unknown")")
  }

  private func begin(with env: [String: Any]?) {
    guard let env else {
      skip("no_owner_envelope")
      return
    }
    envelope = env
    attach()
    setSurfaceVisible(true)
    paintSystemStart()
    markFirstFrame()
    notifyPaintable()
    notifyFirstFrameCommitted()
    notifyOwnerVisible()
    if let ss = env["systemStart"] as? [String: Any],
       let ms = ss["minVisibleMs"] as? Int {
      minVisibleMs = max(0, ms)
    }
    parseIntro(env["intro"] as? [String: Any])
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(minVisibleMs)) { [weak self] in
      self?.afterSystemStartMinVisible()
    }
  }

  private func paintSystemStart() {
    guard let surface, let env = envelope,
          let ss = env["systemStart"] as? [String: Any] else { return }
    surface.subviews.forEach { $0.removeFromSuperview() }
    let bg = ss["backgroundColor"] as? String ?? "#FFFFFF"
    surface.backgroundColor = UIColor(dibayHex: bg) ?? .white
    let brandEnabled = ss["brandAssetEnabled"] as? Bool ?? false
    let brandId = brandEnabled ? (ss["brandAssetMediaId"] as? String ?? "") : ""
    if !brandId.isEmpty, let img = Self.loadStill(mediaId: brandId) {
      let iv = UIImageView(image: img)
      iv.contentMode = .scaleAspectFit
      let sizeNorm = Self.brandSizeNorm(ss["brandSizePreset"] as? String)
      let x = CGFloat(ss["brandXNorm"] as? Double ?? 0.5)
      let y = CGFloat(ss["brandYNorm"] as? Double ?? 0.5)
      surface.addSubview(iv)
      surface.layoutIfNeeded()
      let w = surface.bounds.width
      let h = surface.bounds.height
      let side = min(w, h) * sizeNorm
      iv.frame = CGRect(x: w * x - side / 2, y: h * y - side / 2, width: side, height: side)
      iv.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
    }
    NSLog("[%@] SYSTEM_START painted", DibayStartupCompositorHost.tag)
  }

  private func parseIntro(_ intro: [String: Any]?) {
    introScenes = []
    guard let intro, (intro["present"] as? Bool) == true,
          let doc = intro["document"] as? [String: Any],
          let scenes = doc["scenes"] as? [[String: Any]] else { return }
    introScenes = scenes
  }

  private func afterSystemStartMinVisible() {
    guard !handoffComplete, !skipped else { return }
    if introScenes.isEmpty {
      introComplete = true
      maybeHandoff(reason: "ss_to_home_intro_absent")
      return
    }
    sceneIndex = 0
    paintIntroScene(sceneIndex)
    scheduleSceneAdvance()
  }

  private func paintIntroScene(_ index: Int) {
    guard let surface, index >= 0, index < introScenes.count else { return }
    surface.subviews.forEach { $0.removeFromSuperview() }
    let scene = introScenes[index]
    var color = "#000000"
    if let bg = scene["background"] as? [String: Any],
       (bg["type"] as? String) == "COLOR" {
      color = bg["color"] as? String ?? color
    }
    surface.backgroundColor = UIColor(dibayHex: color) ?? .black
    let elements = (scene["elements"] as? [[String: Any]])
      ?? (scene["layers"] as? [[String: Any]])
      ?? []
    for el in elements {
      let type = el["type"] as? String ?? ""
      if type == "TEXT" {
        let label = UILabel(frame: surface.bounds)
        label.text = (el["text"] as? String) ?? (el["content"] as? String) ?? ""
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        surface.addSubview(label)
      } else if type == "IMAGE" || type == "LOGO" {
        let mediaId = el["mediaId"] as? String ?? ""
        guard !mediaId.isEmpty, let img = Self.loadStill(mediaId: mediaId) else { continue }
        let iv = UIImageView(image: img)
        iv.contentMode = .scaleAspectFit
        iv.frame = surface.bounds
        iv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        surface.addSubview(iv)
      }
      // GIF / MP4: OPEN — no native playback claim in P7
    }
    NSLog("[%@] INTRO scene painted index=%d", DibayStartupCompositorHost.tag, index)
  }

  private func scheduleSceneAdvance() {
    sceneWorkItem?.cancel()
    guard sceneIndex < introScenes.count else { return }
    let duration = max(400, introScenes[sceneIndex]["durationMs"] as? Int ?? 2000)
    let work = DispatchWorkItem { [weak self] in
      guard let self, !self.handoffComplete, !self.skipped else { return }
      if self.sceneIndex + 1 < self.introScenes.count {
        self.sceneIndex += 1
        self.paintIntroScene(self.sceneIndex)
        self.scheduleSceneAdvance()
      } else {
        self.introComplete = true
        NSLog("[%@] INTRO last_frame_hold awaiting HOME_PRESENTATION_READY", DibayStartupCompositorHost.tag)
        self.maybeHandoff(reason: "intro_complete")
      }
    }
    sceneWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(duration), execute: work)
  }

  private func maybeHandoff(reason: String) {
    guard !handoffComplete, !skipped else { return }
    guard introComplete else { return }
    if !homeReady {
      NSLog("[%@] handoff_deferred reason=%@ retainingLastFrame=true", DibayStartupCompositorHost.tag, reason)
      return
    }
    handoffComplete = true
    requestHandoffYield()
    NSLog("[%@] HANDOFF complete reason=%@", DibayStartupCompositorHost.tag, reason)
    onHandoff?()
  }

  private func markFirstFrame() {
    guard !firstProductFrame else { return }
    firstProductFrame = true
    NSLog("[%@] FIRST_PRODUCT_FRAME", DibayStartupCompositorHost.tag)
    onFirstFrame?()
  }

  private func skip(_ reason: String) {
    skipped = true
    NSLog("[%@] compositor_skipped reason=%@", DibayStartupCompositorHost.tag, reason)
    onSkipped?(reason)
  }

  // MARK: - Verified envelope store (iOS)

  private static func verifiedDir() -> URL {
    let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
    return base.appendingPathComponent("dibay-startup-envelope/verified", isDirectory: true)
  }

  private static func loadVerifiedOwnerEnvelope() -> [String: Any]? {
    // Prefer already-verified local envelope; optionally refresh from Live.
    refreshEnvelopeFromLiveIfPossible()
    let envURL = verifiedDir().appendingPathComponent("startup-envelope.json")
    let metaURL = verifiedDir().appendingPathComponent("meta.json")
    guard let envData = try? Data(contentsOf: envURL),
          let metaData = try? Data(contentsOf: metaURL),
          let env = try? JSONSerialization.jsonObject(with: envData) as? [String: Any],
          let meta = try? JSONSerialization.jsonObject(with: metaData) as? [String: Any]
    else { return nil }
    guard (env["schemaVersion"] as? Int) == 14 else { return nil }
    guard ((env["contentClass"] as? String) ?? "").uppercased() == "OWNER" else { return nil }
    let integrity = (env["integrity"] as? String) ?? ""
    let expected = (meta["envelopeIntegrity"] as? String) ?? ""
    guard !integrity.isEmpty, integrity.caseInsensitiveCompare(expected) == .orderedSame else {
      return nil
    }
    return env
  }

  private static func refreshEnvelopeFromLiveIfPossible() {
    guard let origin = Bundle.main.object(forInfoDictionaryKey: "DibayServerOrigin") as? String,
          !origin.isEmpty,
          let url = URL(string: origin + "/api/intro/device/live")
    else {
      // Fall back to Capacitor server url if present in capacitor.config
      guard let capOrigin = resolveCapServerOrigin(),
            let url = URL(string: capOrigin + "/api/intro/device/live") else { return }
      fetchAndCommitEnvelope(from: url)
      return
    }
    fetchAndCommitEnvelope(from: url)
  }

  private static func resolveCapServerOrigin() -> String? {
    if let path = Bundle.main.path(forResource: "capacitor.config", ofType: "json"),
       let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let server = json["server"] as? [String: Any],
       let urlStr = server["url"] as? String,
       let u = URL(string: urlStr),
       let scheme = u.scheme,
       let host = u.host {
      var origin = "\(scheme)://\(host)"
      if let port = u.port { origin += ":\(port)" }
      return origin
    }
    return nil
  }

  private static func fetchAndCommitEnvelope(from liveURL: URL) {
    var req = URLRequest(url: liveURL)
    req.timeoutInterval = 2.5
    let sem = DispatchSemaphore(value: 0)
    var liveObj: [String: Any]?
    URLSession.shared.dataTask(with: req) { data, _, _ in
      defer { sem.signal() }
      guard let data,
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            (obj["ok"] as? Bool) == true,
            (obj["kind"] as? String) == "LIVE" else { return }
      liveObj = obj
    }.resume()
    _ = sem.wait(timeout: .now() + 3)
    guard let live = liveObj,
          (live["packageAuthority"] as? String) == "StartupPackageEnvelope",
          let envUrlStr = live["envelopeRetrievalUrl"] as? String,
          let envURL = URL(string: envUrlStr) else { return }
    var envReq = URLRequest(url: envURL)
    envReq.timeoutInterval = 2.5
    let sem2 = DispatchSemaphore(value: 0)
    var envData: Data?
    URLSession.shared.dataTask(with: envReq) { data, _, _ in
      envData = data
      sem2.signal()
    }.resume()
    _ = sem2.wait(timeout: .now() + 3)
    guard let envData,
          let env = try? JSONSerialization.jsonObject(with: envData) as? [String: Any],
          (env["schemaVersion"] as? Int) == 14,
          ((env["contentClass"] as? String) ?? "").uppercased() == "OWNER",
          let integrity = env["integrity"] as? String,
          let generationId = env["generationId"] as? String
    else { return }

    let mediaDir = verifiedDir().appendingPathComponent("media", isDirectory: true)
    let fm = FileManager.default
    try? fm.createDirectory(at: mediaDir, withIntermediateDirectories: true)
    if let assetUrls = live["assetRetrievalUrls"] as? [String: String],
       let manifest = env["mediaManifest"] as? [[String: Any]] {
      for entry in manifest {
        guard let mediaId = entry["mediaId"] as? String,
              let uStr = assetUrls[mediaId],
              let u = URL(string: uStr) else { continue }
        if let d = try? Data(contentsOf: u) {
          try? d.write(to: mediaDir.appendingPathComponent(mediaId), options: .atomic)
        }
      }
    }
    try? fm.createDirectory(at: verifiedDir(), withIntermediateDirectories: true)
    try? envData.write(to: verifiedDir().appendingPathComponent("startup-envelope.json"), options: .atomic)
    let meta: [String: Any] = [
      "generationId": generationId,
      "envelopeIntegrity": integrity,
      "packageId": live["packageId"] as? String ?? "",
      "releaseId": live["releaseId"] as? String ?? "",
      "schemaVersion": 14,
    ]
    if let metaData = try? JSONSerialization.data(withJSONObject: meta) {
      try? metaData.write(to: verifiedDir().appendingPathComponent("meta.json"), options: .atomic)
    }
  }

  private static func loadStill(mediaId: String) -> UIImage? {
    let url = verifiedDir().appendingPathComponent("media").appendingPathComponent(mediaId)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
  }

  private static func brandSizeNorm(_ preset: String?) -> CGFloat {
    switch (preset ?? "M").uppercased() {
    case "S": return 0.18
    case "L": return 0.40
    default: return 0.28
    }
  }
}

private extension UIColor {
  convenience init?(dibayHex: String) {
    var s = dibayHex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    let r = CGFloat((v >> 16) & 0xff) / 255
    let g = CGFloat((v >> 8) & 0xff) / 255
    let b = CGFloat(v & 0xff) / 255
    self.init(red: r, green: g, blue: b, alpha: 1)
  }
}
