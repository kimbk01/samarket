import UIKit

protocol DibayIntroRuntimeListener: AnyObject {
  func onFirstFrameReady(identity: [String: Any])
  func onIntroCompleted(reason: String)
  func onIntroAborted(reason: String)
}

/// 13th runtime — VERIFIED local package only.
final class DibayIntroRuntimeController {
  weak var listener: DibayIntroRuntimeListener?
  private let delivery = DibayIntroLiveDelivery()
  private weak var hostView: UIView?
  private var overlay: UIView?
  private var surface: DibayIntroSceneSurface?
  private var model: DibayIntroPackModel?
  private var mediaFiles: [String: URL] = [:]
  private var identity: [String: Any] = [:]
  private var sceneIndex = 0
  private var firstFrameEmitted = false
  private var completed = false
  private var aborted = false
  private var running = false
  private var sceneWorkItem: DispatchWorkItem?

  @discardableResult
  func prepareVerifiedPackage() -> DibayIntroLiveDelivery.Result {
    delivery.syncForColdStart()
  }

  @discardableResult
  func attachAndPlayIfPrepared(hostView: UIView, sync: DibayIntroLiveDelivery.Result) -> Bool {
    guard sync.canRender, let integrity = sync.packageIntegrity else { return false }
    do {
      let model = try DibayIntroPackModel.parseAndVerify(
        packURL: delivery.store.verifiedPackURL, expectedIntegrity: integrity)
      self.model = model
      identity = [
        "packageId": model.packageId,
        "releaseId": model.releaseId,
        "packageIntegrity": model.packageIntegrity,
        "syncReason": sync.reason,
      ]
      var files: [String: URL] = [:]
      for asset in model.assetsByMediaId.values {
        let f = delivery.store.verifiedDir.appendingPathComponent(asset.relativePath)
        guard FileManager.default.fileExists(atPath: f.path) else {
          delivery.store.quarantineVerified(reason: "asset_missing_at_render")
          listener?.onIntroAborted(reason: "ASSET_MISSING:\(asset.mediaId)")
          return false
        }
        files[asset.mediaId] = f
      }
      mediaFiles = files
      self.hostView = hostView
      attachOverlay(on: hostView)
      running = true
      showScene(0)
      NSLog("[DibayIntroRuntime] intro_started packageId=%@", model.packageId)
      return true
    } catch {
      delivery.store.quarantineVerified(reason: "\(error)")
      listener?.onIntroAborted(reason: "PACK_PARSE_FAILED")
      return false
    }
  }

  @discardableResult
  func tryStartWithLiveMatchPolicy(hostView: UIView) -> Bool {
    let sync = prepareVerifiedPackage()
    NSLog("[DibayIntroRuntime] sync reason=%@ canRender=%d", sync.reason, sync.canRender ? 1 : 0)
    var started = false
    let sem = DispatchSemaphore(value: 0)
    DispatchQueue.main.async {
      started = self.attachAndPlayIfPrepared(hostView: hostView, sync: sync)
      sem.signal()
    }
    _ = sem.wait(timeout: .now() + 3)
    return started
  }

  private func attachOverlay(on host: UIView) {
    let root = UIView(frame: host.bounds)
    root.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // Hold System Start / Scene1 color — never expose black/white interstitial under Cap.
    root.backgroundColor = Self.resolveHoldBackgroundColor()
    root.isUserInteractionEnabled = true
    let surface = DibayIntroSceneSurface(frame: root.bounds)
    surface.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    surface.setMediaFiles(mediaFiles)
    surface.onCta = { [weak self] action, dest in
      self?.onCta(actionType: action, destination: dest)
    }
    root.addSubview(surface)
    host.addSubview(root)
    overlay = root
    self.surface = surface
  }

  private func onCta(actionType: String, destination: String?) {
    guard !aborted, !completed else { return }
    if actionType == "NEXT_SCENE" {
      sceneWorkItem?.cancel()
      let next = sceneIndex + 1
      if let model, next < model.scenes.count {
        showScene(next)
      } else {
        complete("CTA_FINISH")
      }
    } else if actionType == "FINISH_INTRO" {
      complete("CTA_FINISH")
    } else if actionType == "INTERNAL_DESTINATION" {
      complete("CTA_DESTINATION:\(destination ?? "")")
    }
  }

  private func showScene(_ index: Int) {
    guard let model, index >= 0, index < model.scenes.count, let surface else {
      complete("NO_MORE_SCENES")
      return
    }
    sceneIndex = index
    let scene = model.scenes[index]
    surface.bindScene(scene, compositionW: model.compositionW, compositionH: model.compositionH)
    watchFirstFrame()
    sceneWorkItem?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.onSceneTick() }
    sceneWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(max(100, scene.durationMs)), execute: work)
  }

  private func watchFirstFrame() {
    guard !firstFrameEmitted else { return }
    func poll(attempt: Int) {
      if firstFrameEmitted || aborted || completed { return }
      if surface?.painted == true {
        emitFirstFrame()
        return
      }
      if attempt > 120 {
        abort("FIRST_FRAME_NOT_PAINTED")
        return
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) {
        poll(attempt: attempt + 1)
      }
    }
    poll(attempt: 0)
  }

  private func emitFirstFrame() {
    guard !firstFrameEmitted, !aborted else { return }
    firstFrameEmitted = true
    listener?.onFirstFrameReady(identity: identity)
  }

  private func onSceneTick() {
    guard !aborted, !completed, let model else { return }
    let next = sceneIndex + 1
    if next >= model.scenes.count {
      complete("TIMELINE_DONE")
      return
    }
    let current = model.scenes[sceneIndex]
    if current.transitionType == "FADE" {
      runCrossfadeTo(next, durationMs: max(100, current.transitionDurationMs))
      return
    }
    if let axis = current.slideDirection {
      runSlideTo(next, durationMs: max(100, current.transitionDurationMs), direction: axis)
      return
    }
    showScene(next)
  }

  private func runCrossfadeTo(_ nextIndex: Int, durationMs: Int) {
    guard let model, let overlay, let hostView else {
      abort("FADE_NO_SURFACE")
      return
    }
    let nextScene = model.scenes[nextIndex]
    let incoming = DibayIntroSceneSurface(frame: overlay.bounds)
    incoming.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    incoming.setMediaFiles(mediaFiles)
    incoming.onCta = { [weak self] action, dest in
      self?.onCta(actionType: action, destination: dest)
    }
    incoming.alpha = 0
    overlay.addSubview(incoming)
    incoming.bindScene(nextScene, compositionW: model.compositionW, compositionH: model.compositionH)
    let outgoing = surface
    UIView.animate(withDuration: Double(durationMs) / 1000.0, animations: {
      outgoing?.alpha = 0
      incoming.alpha = 1
    }, completion: { [weak self] _ in
      guard let self, !self.aborted, !self.completed else { return }
      outgoing?.removeFromSuperview()
      self.surface = incoming
      self.sceneIndex = nextIndex
      self.watchFirstFrame()
      self.sceneWorkItem?.cancel()
      let work = DispatchWorkItem { [weak self] in self?.onSceneTick() }
      self.sceneWorkItem = work
      DispatchQueue.main.asyncAfter(
        deadline: .now() + .milliseconds(max(100, nextScene.durationMs)), execute: work)
    })
    _ = hostView
  }

  /** Outgoing + incoming simultaneous slide (no black interstitial). */
  private func runSlideTo(_ nextIndex: Int, durationMs: Int, direction: String) {
    guard let model, let overlay else {
      abort("SLIDE_NO_SURFACE")
      return
    }
    let nextScene = model.scenes[nextIndex]
    let width = overlay.bounds.width
    let height = overlay.bounds.height
    let axis = direction
    var outTx: CGFloat = 0
    var outTy: CGFloat = 0
    var inStartTx: CGFloat = 0
    var inStartTy: CGFloat = 0
    switch axis {
    case "RIGHT":
      outTx = width
      inStartTx = -width
    case "UP":
      outTy = -height
      inStartTy = height
    case "DOWN":
      outTy = height
      inStartTy = -height
    default:
      outTx = -width
      inStartTx = width
    }
    let incoming = DibayIntroSceneSurface(frame: overlay.bounds)
    incoming.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    incoming.setMediaFiles(mediaFiles)
    incoming.onCta = { [weak self] action, dest in
      self?.onCta(actionType: action, destination: dest)
    }
    incoming.transform = CGAffineTransform(translationX: inStartTx, y: inStartTy)
    overlay.addSubview(incoming)
    incoming.bindScene(nextScene, compositionW: model.compositionW, compositionH: model.compositionH)
    let outgoing = surface
    UIView.animate(withDuration: Double(durationMs) / 1000.0, animations: {
      outgoing?.transform = CGAffineTransform(translationX: outTx, y: outTy)
      incoming.transform = .identity
    }, completion: { [weak self] _ in
      guard let self, !self.aborted, !self.completed else { return }
      outgoing?.removeFromSuperview()
      outgoing?.transform = .identity
      self.surface = incoming
      self.sceneIndex = nextIndex
      self.watchFirstFrame()
      self.sceneWorkItem?.cancel()
      let work = DispatchWorkItem { [weak self] in self?.onSceneTick() }
      self.sceneWorkItem = work
      DispatchQueue.main.asyncAfter(
        deadline: .now() + .milliseconds(max(100, nextScene.durationMs)), execute: work)
    })
  }

  private func complete(_ reason: String) {
    guard !completed, !aborted else { return }
    completed = true
    running = false
    sceneWorkItem?.cancel()
    listener?.onIntroCompleted(reason: reason)
  }

  private func abort(_ reason: String) {
    guard !aborted, !completed else { return }
    aborted = true
    running = false
    sceneWorkItem?.cancel()
    DispatchQueue.main.async { self.removeOverlay() }
    listener?.onIntroAborted(reason: reason)
  }

  func removeOverlay() {
    overlay?.removeFromSuperview()
    overlay = nil
    surface = nil
  }

  func dismissAfterHandoff() {
    removeOverlay()
  }

  /// Same hold as LaunchScreen / Cap continuation — never black/white gap.
  private static func resolveHoldBackgroundColor() -> UIColor {
    guard let url = Bundle.main.url(forResource: "system_start_timing", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let hex = obj["backgroundColor"] as? String
    else {
      return UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0) // cream fail-closed — never legacy indigo
    }
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let n = UInt32(h, radix: 16) else {
      return UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0) // cream fail-closed — never legacy indigo
    }
    return UIColor(
      red: CGFloat((n >> 16) & 0xFF) / 255.0,
      green: CGFloat((n >> 8) & 0xFF) / 255.0,
      blue: CGFloat(n & 0xFF) / 255.0,
      alpha: 1.0
    )
  }
}
