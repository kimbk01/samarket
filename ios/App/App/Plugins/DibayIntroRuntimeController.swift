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
    root.backgroundColor = .black
    root.isUserInteractionEnabled = true
    let surface = DibayIntroSceneSurface(frame: root.bounds)
    surface.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    root.addSubview(surface)
    host.addSubview(root)
    overlay = root
    self.surface = surface
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
    if current.transitionType == "FADE" || current.transitionType == "SLIDE" {
      abort("TRANSITION_NOT_IMPLEMENTED:\(current.transitionType)")
      return
    }
    showScene(next)
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
}
