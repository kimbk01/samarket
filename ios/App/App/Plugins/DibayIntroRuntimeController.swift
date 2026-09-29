import UIKit

/**
 * V4 iOS Intro runtime — Active Pack → native Scene timeline.
 * FIRST_FRAME_READY = authored Scene1 pixels paint-ready (not parse/attach alone).
 * INTRO_COMPLETED = timeline completion only (not FIRST_FRAME_READY).
 */
final class DibayIntroRuntimeController {
  protocol Listener: AnyObject {
    func onFirstFrameReady(identity: [String: Any])
    func onIntroCompleted(reason: String)
    func onIntroAborted(reason: String)
  }

  weak var listener: Listener?
  private weak var hostView: UIView?
  private let store = DibayIntroAuthorityStore.shared
  private var overlayRoot: UIView?
  private var sceneSurface: DibayIntroSceneSurface?
  private var model: DibayIntroPackModel?
  private var activeIdentity: [String: Any]?
  private var sceneIndex = 0
  private var firstFrameEmitted = false
  private var completed = false
  private var aborted = false
  private var running = false
  private var sceneWorkItem: DispatchWorkItem?
  private var firstFrameWatchdog: DispatchWorkItem?

  var isRunning: Bool { running && !completed && !aborted }
  var hasEmittedFirstFrame: Bool { firstFrameEmitted }

  /**
   * Cold-start entry: ensure Active from Ready if needed, verify, attach, play.
   * Returns true when Intro presentation started.
   */
  @discardableResult
  func tryStartFromLocalActive(hostView: UIView) -> Bool {
    self.hostView = hostView
    do {
      guard try store.ensureActiveFromReadyIfNeeded() else {
        NSLog("[DibayIntroRuntime] intro_skip reason=NO_ACTIVE")
        return false
      }
      guard let active = try store.readActiveMetaOrNull() else {
        NSLog("[DibayIntroRuntime] intro_skip reason=NO_ACTIVE_META")
        return false
      }
      guard let packURL = try store.resolveActivePackFile(),
            let assetsRoot = try store.resolveActiveAssetsRoot()
      else {
        abort("ACTIVE_PACK_MISSING")
        return false
      }
      let expectedIntegrity = active["packIntegrity"] as? String ?? ""
      let parsed = try DibayIntroPackModel.parseAndVerify(
        packURL: packURL, expectedIntegrity: expectedIntegrity
      )
      guard parsed.ok, let model = parsed.model else {
        abort(parsed.failureCode ?? "PACK_PARSE_FAILED")
        return false
      }
      self.model = model
      self.activeIdentity = active

      // Ensure Pretendard font authority files exist locally before paint.
      let fonts = try store.assertFonts()
      if !fonts.ok {
        abort("FONT_AUTHORITY_MISSING:\(fonts.missing.joined(separator: ","))")
        return false
      }

      let scene1 = model.scenes[0]
      var mediaPaths: [String: URL] = [:]
      let base = try store.authorityBaseURL()
      for layer in scene1.layers {
        if layer.type == "IMAGE" || layer.type == "LOGO" {
          guard let ref = layer.mediaRefId, let asset = model.assetsByMediaRef[ref] else {
            abort("MISSING_ASSET_AUTHORITY:\(layer.mediaRefId ?? "")")
            return false
          }
          var assetURL = base.appendingPathComponent(asset.relativePackPath)
          if !FileManager.default.fileExists(atPath: assetURL.path) {
            assetURL = assetsRoot.appendingPathComponent(
              (asset.relativePackPath as NSString).lastPathComponent
            )
          }
          guard DibayIntroPackModel.verifyAssetFile(assetURL, sealedIntegrity: asset.sealedIntegrity) else {
            abort("ASSET_INTEGRITY_OR_MISSING:\(asset.sealedAssetId)")
            return false
          }
          mediaPaths[ref] = assetURL
        }
        if (layer.type == "TEXT" || layer.type == "CTA"),
           let fontId = layer.fontAssetId, !fontId.isEmpty {
          let font = try store.fontsRootURL().appendingPathComponent(fontId)
          if !FileManager.default.fileExists(atPath: font.path) {
            abort("FONT_MISSING:\(fontId)")
            return false
          }
        }
      }

      attachOverlay(mediaPaths: mediaPaths, fontsRoot: try store.fontsRootURL())
      running = true
      sceneIndex = 0
      showScene(0, animateFade: false)
      let watchdog = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        if !self.firstFrameEmitted && self.running && !self.aborted && !self.completed {
          self.abort("FIRST_FRAME_TIMEOUT")
        }
      }
      firstFrameWatchdog = watchdog
      DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: watchdog)
      NSLog(
        "[DibayIntroRuntime] intro_started packId=%@ revision=%@ scenes=%d",
        model.packId, model.publishedRevisionId, model.scenes.count
      )
      return true
    } catch {
      NSLog("[DibayIntroRuntime] intro_start_failed %@", error.localizedDescription)
      abort("INTRO_START_EXCEPTION:\(error.localizedDescription)")
      return false
    }
  }

  private func attachOverlay(mediaPaths: [String: URL], fontsRoot: URL) {
    guard let host = hostView else { return }
    let root = UIView(frame: host.bounds)
    root.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    root.backgroundColor = .black
    root.isUserInteractionEnabled = true
    let surface = DibayIntroSceneSurface(fontsRoot: fontsRoot)
    surface.setMediaPaths(mediaPaths)
    surface.frame = root.bounds
    surface.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    root.addSubview(surface)
    host.addSubview(root)
    host.bringSubviewToFront(root)
    overlayRoot = root
    sceneSurface = surface
  }

  private func showScene(_ index: Int, animateFade: Bool) {
    guard let model = model else {
      complete("TIMELINE_COMPLETE")
      return
    }
    if index < 0 || index >= model.scenes.count {
      complete("TIMELINE_COMPLETE")
      return
    }
    sceneIndex = index
    let scene = model.scenes[index]
    if animateFade, let surface = sceneSurface {
      UIView.animate(withDuration: 0.12, animations: {
        surface.alpha = 0
      }, completion: { _ in
        surface.bindScene(scene, compositionW: model.compositionW, compositionH: model.compositionH)
        surface.alpha = 0
        UIView.animate(withDuration: 0.18, animations: {
          surface.alpha = 1
        }, completion: { _ in
          self.armSceneDuration()
        })
        self.watchFirstFrame()
      })
    } else if let surface = sceneSurface {
      surface.alpha = 1
      surface.bindScene(scene, compositionW: model.compositionW, compositionH: model.compositionH)
      watchFirstFrame()
      armSceneDuration()
    }
  }

  private func watchFirstFrame() {
    guard !firstFrameEmitted, sceneIndex == 0, let surface = sceneSurface else { return }
    func emitWhenReady(attempt: Int) {
      if firstFrameEmitted || aborted || completed { return }
      guard let surface = sceneSurface else { return }
      let hasLayers = !(model?.scenes.first?.layers.isEmpty ?? true)
      if surface.bounds.width <= 0 || surface.bounds.height <= 0 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) {
          emitWhenReady(attempt: attempt + 1)
        }
        return
      }
      if hasLayers && surface.subviews.isEmpty && !surface.hasPaintedAuthoredPixels() {
        if attempt > 120 { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) {
          emitWhenReady(attempt: attempt + 1)
        }
        return
      }
      firstFrameEmitted = true
      NSLog(
        "[DibayIntroRuntime] INTRO_FIRST_FRAME_READY sceneIndex=0 children=%d",
        surface.subviews.count
      )
      listener?.onFirstFrameReady(identity: activeIdentity ?? [:])
    }
    surface.layoutIfNeeded()
    DispatchQueue.main.async {
      emitWhenReady(attempt: 0)
    }
  }

  private func armSceneDuration() {
    sceneWorkItem?.cancel()
    guard let model = model, sceneIndex < model.scenes.count else { return }
    let scene = model.scenes[sceneIndex]
    let delay = max(0, Double(scene.durationMs) / 1000.0)
    let work = DispatchWorkItem { [weak self] in
      self?.onSceneTick()
    }
    sceneWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  private func onSceneTick() {
    guard running, !completed, !aborted, let model = model else { return }
    let scene = model.scenes[sceneIndex]
    let next = sceneIndex + 1
    if next >= model.scenes.count {
      complete("TIMELINE_COMPLETE")
      return
    }
    if let t = scene.transitionAfter, t.type == "FADE", t.durationMs > 0, let surface = sceneSurface {
      let fadeMs = Double(t.durationMs) / 1000.0
      let half = max(0.001, fadeMs / 2)
      UIView.animate(withDuration: half, animations: {
        surface.alpha = 0
      }, completion: { _ in
        self.sceneIndex = next
        let nextScene = model.scenes[next]
        surface.bindScene(nextScene, compositionW: model.compositionW, compositionH: model.compositionH)
        surface.alpha = 0
        UIView.animate(withDuration: fadeMs - half, animations: {
          surface.alpha = 1
        }, completion: { _ in
          self.armSceneDuration()
        })
      })
      return
    }
    if let t = scene.transitionAfter, t.type == "SLIDE" {
      NSLog("[DibayIntroRuntime] SLIDE_PRESENT_FALLTHROUGH_CUT scene=%@", scene.sceneId)
    }
    showScene(next, animateFade: false)
  }

  private func complete(_ reason: String) {
    if completed || aborted { return }
    completed = true
    running = false
    sceneWorkItem?.cancel()
    firstFrameWatchdog?.cancel()
    NSLog("[DibayIntroRuntime] INTRO_COMPLETED reason=%@", reason)
    // HOLD last authored frame until HOME_PRESENTATION_READY.
    // Do NOT removeOverlay here — releaseToHome() owns removal.
    listener?.onIntroCompleted(reason: reason)
  }

  /// Product handoff: remove Intro overlay only when Home is presentation-ready.
  func releaseToHome(source: String) {
    NSLog("[DibayIntroRuntime] INTRO_RELEASE_TO_HOME source=%@", source)
    removeOverlay()
  }

  private func abort(_ reason: String) {
    if completed || aborted { return }
    aborted = true
    running = false
    sceneWorkItem?.cancel()
    firstFrameWatchdog?.cancel()
    NSLog("[DibayIntroRuntime] INTRO_ABORTED reason=%@", reason)
    removeOverlay()
    listener?.onIntroAborted(reason: reason)
  }

  private func removeOverlay() {
    overlayRoot?.removeFromSuperview()
    overlayRoot = nil
    sceneSurface = nil
  }

  func releaseRuntime() {
    sceneWorkItem?.cancel()
    firstFrameWatchdog?.cancel()
    removeOverlay()
    running = false
  }
}
